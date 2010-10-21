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
  try {
    if(message.method) {
      message.headers.via[0].params.received=remote.address;
//      message.headers.via[0].params.rport=remote.port;
      router.call({
        proxy: function(target) {
          return proxyRequest(transport, message, target); 
        },
        respond: function(rs) {
          if(typeof rs === 'number')
            rs = sip.makeRespose(message, rs);

          transport(rs, {protocol: rs.headers.via[0].protocol, address: remote.address, port: rq.headers.via[0].port});
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
  if(remote.address == '172.16.1.2' && remote.port == 5060) {
    this.proxy(sip.parseUri(rq.uri));
  }
  else if(rq.method === 'REGISER') {
    respond(403);
  }
  else {
    var uri = sip.parseUri(rq.uri);
    uri.host = '172.16.1.2';
    uri.port = 5060;
    uri.params.transport = remote.protocol.toLowerCase();
    this.proxy(uri);
  }
}

var transport = sip.makeTransport({
  onMessage: proxyCore.bind(this, function() { transport.send.apply(transport, arguments); }, route)
});

