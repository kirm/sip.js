// simple outbound proxy server
var sys = require('sys');
var sip = require('./sip.js');
var crypto = require('crypto');

function branch(rq) {
  var md5 = crypto.createHash('md5');

  md5.update(rq.headers.via[0].params.branch);
  if(rq.headers.from.params.tag)
    md5.update(rq.headers.from.params.tag);

  if(rq.headers.to.params.tag)
    md5.update(rq.headers.to.params.tag);

  md5.update(rq.headers['call-id']);
  md5.update(rq.headers.cseq.seq);
  md5.update(rq.uri);

  return 'z9hG4bK'+md5.digest('hex');  
}

function proxyRequest(transport, rq, target) {
  rq.uri = target;

  sip.resolve(target, function(address) {
    if(address.length === 0) {
      transport(sip.makeResponse(rq, 503), {protocol: rq.headers.via[0].protocol, address: rq.headers.via[0].received, port: rq.headers.via[0].port});
    }

    rq.headers.via.unshift({params: {branch: branch(rq)}});
    transport(rq, address[0]);
  });
}

function proxyResponse(transport, rs) {
  rs.headers.via.shift();

  transport(rs, {protocol: rs.headers.via[0].protocol, address: rs.headers.via[0].params.received, port: rs.headers.via[0].port}); 
}

function proxyCore(transport, router, message, remote) {
  var trn = transaction.get(message);

  if(trn) {
    trn.message(message);
    return;
  }

  try {
    if(message.method) {
      message.headers.via[0].params.received=remote.address;
      router.call({
        forward: function(target) {
          return proxyRequest(transport, message, target); 
        },
        transactForward: function(target) {
          if(message.method === 'ACK')
            return proxyRequest(transport, message, target);

          var server = transaction.createServerTransaction(message, remote);
          var client = transaction.createClientTransaction(
            {
              method:message.method,
              uri: target,
              headers: message.headers,
              content: message.content
            },
            function(rs, remote) { 
              rs.headers.via.shift();
              server.send(rs);
            }); 
        },
        respond: function(rs) {
          if(typeof rs === 'number')
            rs = sip.makeRespose(message, rs);

          transport(rs, {protocol: rs.headers.via[0].protocol, address: remote.address, port: rq.headers.via[0].port});
        },
        transactResponse: function(rs) {
          if(typeof rs === 'number')
            rs = sip.makeResponse(message, rs);
         
          transaction.createServerTransaction(message, remote).send(rs);
        }
      }, message, remote);
    }
    else
      proxyResponse(transport, message);
  } 
  catch(e) {
    sys.debug(e + e.stack);
  }
}

function route(rq, remote) {
  if(remote.address == '172.16.1.10' && remote.port == 5060) {
    this.transactForward(sip.parseUri(rq.uri));
  }
  else if(rq.method === 'REGISTER') {
    this.respond(403);
  }
  else {
    var uri = sip.parseUri(rq.uri);
    uri.host = '172.16.1.10';
    uri.port = 5060;
    uri.params.transport = remote.protocol.toLowerCase();
    this.transactForward(uri);
  }
}

function send(message, remote) {
  var cn = transport.open(remote);
  
  try {
    cn.send(message);
  }
  finally {
    cn.release();
  }
}

var transport = sip.makeTransport({
  logger: {
    send: function(m, remote) { sys.log(JSON.stringify(remote) + '--->>' + JSON.stringify(m)); },
    recv: function(m, remote) { sys.log(JSON.stringify(remote) + '<<---' + JSON.stringify(m)); }
  }
},
function(message, remote) {
  //sys.debug(JSON.stringify(['recv', remote, message]));
  proxyCore(send, route, message, remote);
});

var transaction = sip.makeTransactionLayer({}, transport.open.bind(transport));

