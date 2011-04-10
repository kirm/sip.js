var sip=require('sip');
var util=require('sys');

var contexts = {};

function makeContextId(msg) {
  var via = msg.headers.via[0];
  return [via.params.branch, via.protocol, via.host, via.port, msg.headers['call-id'], msg.headers.cseq.seq];
}

function defaultCallback(rs) {
  rs.headers.via.shift();
  exports.send(rs);
}


exports.send = function(msg, callback) {
  var ctx = contexts[makeContextId(msg)];

  if(!ctx) {
    sip.send.apply(arguments);
    return;
  }
 
  return msg.method ? forwardRequest(ctx, msg, callback || defaultCallback) : forwardResponse(ctx, msg);
};


function forwardResponse(ctx, rs, callback) {
  if(+rs.status >= 200) {
    delete contexts[makeContextId(rs)];
  }

  sip.send(rs);
}


function sendCancel(rq, via) {
  sip.send({
    method: 'CANCEL',
    uri: rq.uri,
    headers: {
      via: [via],
      to: rq.headers.to,
      from: rq.headers.from,
      'call-id': rq.headers['call-id'],
      cseq: {method: 'CANCEL', seq: rq.headers.cseq.seq}
    }
  });
}


function forwardRequest(ctx, rq, callback) {
  sip.send(rq, function(rs, remote) {
    if(+rs.status < 200) {
      var via = rs.headers.via[0];
      ctx.cancellers[rs.headers.via[0].params.branch] = function() { sendCancel(rq, via); };

      if(ctx.cancelled)
        sendCancel(rq, via);
    }
    else {
      delete ctx.cancellers[rs.headers.via[0].params.branch];
    }

    callback(rs, remote);
  });
}


function onRequest(rq, route, remote) {
  contexts[makeContextId(rq)] = { cancellers: {} };
  route(sip.copyMessage(rq), remote);
};


exports.start = function(options, route) {
  sip.start(options, function(rq) {
    if(rq.method === 'CANCEL') {
      var ctx = contexts[makeContextId(rq)];

      if(ctx) {
        sip.send(sip.makeResponse(rq, 200));
       
        ctx.cancelled = true;
        if(ctx.cancellers) {
          Object.keys(ctx.cancellers).forEach(function(c) { ctx.cancellers[c](); });
        }
      }
      else {
        sip.send(sip.makeResponse(rq, 481));
      }
    }
    else {
      onRequest(rq, route);
    }
  });
};

exports.stop = sip.stop;

