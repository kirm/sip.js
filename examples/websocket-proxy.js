var sip = require('sip');
var proxy = require('sip/proxy');
var util = require('util');
var crypto = require('crypto');

var bindings = {};

function contacts(user) {
  var record = bindings[user];
  if(!record) return [];
  return Object.keys(record).map(function(x) { return record[x]; });
}

function onRegister(rq, flow) {
  var user = sip.parseUri(rq.headers.to.uri).user;
  if(rq.headers.contact === '*')
    delete bindings[user];  
  else {
    var record = bindings[user];
    if(!record) record = bindings[user] = {};

    rq.headers.contact.forEach(function(x) {
      var ob = !!(x.params['reg-id'] && x.params['+sip.instance']);
      var key = ob ? [x.params['+sip.instance'],x.params['reg-id']].join() : rq.headers['call-id'];
    
      if(!record[key] || record[key].seq < rq.headers.cseq.seq) {
        var binding = {
          contact: x,
          expires: Date.now() + (+x.params.expires || +rq.headers.expires || 3600) * 1000,
          seq: rq.headers.cseq.seq,
          ob: ob
        };

        if(ob) {
          var route_uri = sip.encodeFlowUri(flow);
          route_uri.params.lr = null;
          binding.route = [{uri: route_uri}];
        }
        record[key] = binding;
      }
    });
  }

  if(!rq.headers.to.params.tag) rq.headers.to.params.tag = crypto.randomBytes(8).toString('hex');
 
  var c = contacts(user);
  if(c.length) {
    proxy.send(sip.makeResponse(rq, 200, 'OK', {headers: {
      contact: contacts(user).map(function(c) { return c.contact; }),
      required:  c.some(function(x) { return x.ob; }) ? 'path, outbound' : undefined,
      supported: 'path, outbound'
    }}));
  }
  else {
    proxy.send(sip.makeResponse(rq, 200, 'OK', {headers: { contact: '*' }}));
  }
}

function forwardOutOfDialogRequest(rq, flow) {
  var c = contacts(rq.uri.user);
  if(c.length) {
    rq.uri = c[0].contact.uri;
    if(c[0].ob) {
      var flow_uri = sip.encodeFlowUri(flow);
      flow_uri.params.lr = null;
      rq.headers.route = c[0].route.concat(rq.headers.route || []);
      console.log(rq.headers.route);
      rq.headers['record-route'] = [{uri: flow_uri}].concat(c[0].route, rq.headers['record-route'] || []);
    }
    proxy.send(rq);
  }
  else
    proxy.send(sip.makeResponse(rq, 404, 'Not Found'));
}

function forwardInDialogRequest(rq, flow) {
  if(rq.headers.route) {
    var furi = sip.encodeFlowUri(flow);
    if(rq.headers.route[0].hostname == furi.hostname && rq.headers.route[0].user == furi.user)
      rq.headers.route.shift();
  }

  proxy.send(rq);
}

proxy.start({
  logger: {
    send: function(m) { console.log('send', util.inspect(m,{depth: null})); },
    recv: function(m) { console.log('recv', util.inspect(m,{depth: null})); },
    error: function(e) { console.log(e, e.stack) }
  },
  hostname: process.argv[2],
  ws_port: (+process.argv[3]) || 8506
},
function(rq, flow) {
  rq.uri = sip.parseUri(rq.uri);

  if(rq.method === 'REGISTER')
    onRegister(rq, flow);
  else {
    if(!rq.headers.to.params.tag)
      forwardOutOfDialogRequest(rq, flow);
    else
      forwardInDialogRequest(rq, flow);
  }
});

