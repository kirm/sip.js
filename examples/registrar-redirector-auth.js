// Simple registrar - redirector with authentication
//

var sip = require('sip');
var digest = require('sip/digest');
var util = require('util');
var os = require('os');

var registry = {
  '100': {password: '1234'},
  '101':  {password:  'qwerty'}
};

var realm = os.hostname();

sip.start({
  logger: { 
    send: function(message, address) { debugger; util.debug("send\n" + util.inspect(message, false, null)); },
    recv: function(message, address) { debugger; util.debug("recv\n" + util.inspect(message, false, null)); }
  }
},
function(rq) {
  try {
    if(rq.method === 'REGISTER') {  
      
      //looking up user info
      var username = sip.parseUri(rq.headers.to.uri).user;
      var userinfo = registry[username];

      if(!userinfo) { // we don't know this user and answer with a challenge to hide this fact 
        var session = {realm: realm};
        sip.send(digest.challenge({realm: realm}, sip.makeResponse(rq, 401, 'Authentication Required')));
      }
      else {
        userinfo.session = userinfo.session || {realm: realm};
        if(!digest.authenticateRequest(userinfo.session, rq, {user: username, password: userinfo.password})) {
          sip.send(digest.challenge(userinfo.session, sip.makeResponse(rq, 401, 'Authentication Required')));
        }
        else {
          userinfo.contact = rq.headers.contact;
          var rs = sip.makeResponse(rq, 200, 'Ok');
          rs.headers.contact = rq.headers.contact;
          sip.send(rs);
        }
      }
    }
    else if(rq.method === 'INVITE') {
      var username = sip.parseUri(rq.uri).user;
      var userinfo = registry[username]
      
      if(userinfo && Array.isArray(userinfo.contact) && userinfo.contact.length > 0) {
        var rs = sip.makeResponse(rq, 302, 'Moved');
        rs.headers.contact = userinfo.contact;
        sip.send(rs);
      }
      else {
        sip.send(sip.makeResponse(rq, 404, 'Not Found'));
      }
    }
    else {
      sip.send(sip.makeResponse(rq, 405, 'Method Not Allowed'));
    }
  } catch(e) {
    util.debug(e);
    util.debug(e.stack);

    sip.send(sip.makeResponse(rq, 500, "Server Internal Error"));
  }
});

