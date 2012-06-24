// Somewhat practical example. 
// Some time ago i had to connect an softpbx to a service provider. Service provider used some kind of load balancer that
// responded with '302 Moved Temporarily' to every INVITE. However pbx didn't understand '302' response and was simply dropping
// outbound calls. So i wrote this script, which restarts all requests responded with '302 Moved', installed it on the 
// same host and set it as outbound proxy for the pbx.

var sip = require('sip');
var proxy = require('sip/proxy');
var util = require('util');

proxy.start(
{
  port: 6060,
  logger : {
    send: function(m) { util.debug("send " + util.inspect(m, false, null)); },
    recv: function(m) { util.debug("recv " + util.inspect(m, false, null)); }
  }
}, 
function(rq) {
  try {
    var move_count = 0;
    proxy.send(rq, function onResponse(rs) {
      if(rs.status === 302 && rs.headers.contact && rs.headers.contact.length && move_count++ < 4 ) {
        // restarting request with new target
        rq.uri = rs.headers.contact[0].uri;

        // proxy.send pushes new via into requests, so we have to remove it
        rq.headers.via.shift();

        proxy.send(rq, onResponse);
      }
      else {
        // forwarding non-302 response
       
        // removing top via
        rs.headers.via.shift();

        proxy.send(rs);
      }
    });
  } 
  catch(e) {
    util.debug(e.stack);
  }
});

