var sip = require('sip');
var util = require('util');

var registry = {};

var transport = sip.makeTransport({}, function(m, remote) {
  if(m.method && m.method !== 'ACK') {
    try {
      if(m.method === 'REGISTER') {  
        
        //looking up user info
        var username = sip.parseUri(m.headers.to.uri).user;
        
        registry[username] = m.headers.contact;
        
        var rs = sip.makeResponse(m, 200, 'Ok');
        rs.headers.contact = m.headers.contact;
        transport.send(remote, rs);
      }
      else {
        var username = sip.parseUri(m.uri).user;
        var contacts = registry[username];
        
        if(contacts && Array.isArray(contacts) && contacts.length > 0) {
          var rs = sip.makeResponse(m, 302, 'Moved');
          rs.headers.contact = contacts;
          transport.send(remote, rs);
        }
        else {
          transport.send(remote, sip.makeResponse(m, 404, 'Not Found'));
        }
      }
    } catch(e) {
      util.debug(e);
      util.debug(e.stack);

      transport.send(remote, sip.makeResponse(m, 500, "Server Internal Error"));
    }
  }
});

