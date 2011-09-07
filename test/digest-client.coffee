sip = require 'sip'
digest = require 'sip/digest'
util = require 'util'

sip.start {
  logger:
    send: (rq) -> util.debug "send\n" + util.inspect rq, null, null
    recv: (rq) -> util.debug "recv\n" + util.inspect rq, null, null
}, ->

rq =  
  method: 'REGISTER',
  uri: 'sip:172.16.1.10',
  headers:
    to: {uri: 'sip:101@172.16.1.10' },
    from: {uri: 'sip:101@172.16.1.10'},
    cseq: {method: 'REGISTER', seq: 1},
    'call-id': 123435454
    contact: [{uri: 'sip:101@somewhere.local', params: {expires: 300}}],
    'content-length': 0

sip.send rq, 
  (rs) ->
    try 
      if rs.status == 401 || rs.status == 407
        rq.headers.via.pop()
        rq.headers.cseq.seq++;
     
        context = {} 
        digest.signRequest context, rq, rs, {user: '100', password: 'password'}

        sip.send rq, (rs) -> 
          if 200 <= rs.status < 300
            if false == digest.autheneticateResponse context, rs
              util.debug 'failed to authenticate server'
            util.debug 'Ok'

      else if 300 > rs.status >= 200
        util.debug 'Ok'
      else
        util.debug 'failed to register'
    catch e
      util.debug e
      util.debug e.stack

