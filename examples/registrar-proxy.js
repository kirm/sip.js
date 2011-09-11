// Simple proxy server with registrar function.

var sip = require('sip');
var proxy = require('sip/proxy');
var util = require('sys');

var contacts = {};

proxy.start({
  logger: {
    recv: function(m) { util.debug('recv:' + util.inspect(m, null, null)); },
    send: function(m) { util.debug('send:' + util.inspect(m, null, null)); },
    error: function(e) { util.debug(e.stack); }
  }
}, function(rq) {
  if(rq.method === 'REGISTER') {
    var user = sip.parseUri(rq.headers.to.uri).user;

    contacts[user] = rq.headers.contact;
    var rs = sip.makeResponse(rq, 200, 'Ok');
    rs.headers.to.tag = Math.floor(Math.random() * 1e6);
    
    // Notice  _proxy.send_ not sip.send
    proxy.send(rs);
  }
  else {
    var user = sip.parseUri(rq.uri).user;

    if(contacts[user] && Array.isArray(contacts[user]) && contacts[user].length > 0) {
      rq.uri = contacts[user][0].uri;
      
      proxy.send(sip.makeResponse(rq, 100, 'Trying'));
      
      proxy.send(rq);
    }
    else {
      proxy.send(sip.makeResponse(rq, 404, 'Not Found'));
    }
  }
});

