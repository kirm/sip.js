var sip=require('sip');
var util=require('sys');

var contexts = {};

function onRequest(rq, route) {
  var ctx = {};
  var branch = rq.headers.via[0].params.branch;
  contexts[branch] = ctx;

  function forwardResponse(msg) {
    if(msg.headers.via[0].params.branch !== branch)
      msg.headers.via.shift()

    if(msg.status >= 200)
      delete contexts[branch];

    sip.send(msg);
  }

  route({
    send: function(msg, callback) {
      if(msg.method) {
        var uri = msg.uri;

        sip.send(msg, function(rs, remote) {
          if(rs.status >= 100 && rs.status <= 199) {
            var cancel = {
              method: 'CANCEL',
              uri: uri,
              headers: {
                via: [rs.headers.via[0]],
                cseq: {method: 'CANCEL', seq: rs.headers.cseq.seq},
                'call-id': rs.headers['call-id'],
                from: rs.headers.from,
                to: rs.headers.to,
                'content-length': 0
              }
            }

            ctx.cancel = function() { 
              ctx.cancelled = false;
              sip.send(cancel);
            }

            if(ctx.cancelled)
              ctx.cancel();
          }
          else
            ctx.cancel = null;

          if(callback) 
            callback(rs, remote);
          else 
            forwardResponse(rs);
        });
      }
      else {
        forwardResponse(msg);
      }
    }
  },
  rq);
};

exports.start = function(options, route) {
  sip.start(options, function(rq) {
    if(rq.method === 'CANCEL') {
      var ctx = contexts[rq.headers.via[0].params.branch];

      if(ctx) {
        sip.send(sip.makeResponse(rq, 200));
       
        ctx.cancelled = true; 
        ctx.cancel && ctx.cancel();
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

