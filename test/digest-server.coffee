# digest server code 'unit' test. 
#
#

sip = require 'sip'
digest = require 'sip/digest'
randomBytes = (require 'rbytes').randomBytes
rbytes = (n) -> randomBytes(n).toHex()
util = require 'util'

dialogs = {}

makeDialogId = (rq, tag) ->
  [rq.headers['call-id'], rq.headers.from.params.tag, rq.headers.to.params.tag || tag].join()

context = {realm: 'test', qop: 'auth-int'} 
regcontext = {realm: 'test'}

sip.start {
    logger:
      send: (rq) -> util.debug "send\n" + util.inspect rq, null, null
      recv: (rq) -> util.debug "recv\n" + util.inspect rq, null, null
  }, 
  (rq) ->
    try
      if rq.method != 'REGISTER' && rq.headers.to.params.tag
        (dialogs[makeDialogId rq] || (rq) -> sip.send sip.makeResponse rq, 581)(rq)
      else
        switch rq.method
          when 'REGISTER'
            if !digest.authenticateRequest regcontext, rq, {user: '100', password: '1234'} 
              sip.send digest.challenge regcontext, sip.makeResponse rq, 401, 'Authorization Required'
            else
              rs = sip.makeResponse rq, 200
              rs.headers.to.tag = rbytes 16
              sip.send digest.signResponse regcontext, rs
          when 'INVITE'
            if !digest.authenticateRequest context, rq, {user: '100', password: '1234'}
              sip.send digest.challenge context, sip.makeResponse rq, 401, 'Authorization Required'
            else
              tag = rbytes 16
              dialogs[makeDialogId rq, tag] = (rq) ->
                try
                  if digest.authenticateRequest context, rq
                    sip.send digest.challenge context, sip.makeResponse rq, 401, 'Authorization Required'
                  else
                    switch rq.method
                      when 'BYE'
                        sip.send digest.signResponse context, sip.makeResponse rq, 200
                        delete dialogs[makeDialogId rq, tag]
                      else
                        sip.send digest.signResponse context, sip.makeResponse rq, 400
                catch e
                  util.debug e
              
              rs = sip.makeResponse rq, 200, 'OK'
              rs.content = 
                '''
                v=0
                o=sip 28908764872 28908764872 IN IP4 127.0.0.1
                s=-
                c=IN IP4 127.0.0.1
                t=0 0
                m=audio 0 RTP/AVP 0 8
                a=rtpmap:0 PCMU/8000
                a=rtpmap:8 PCMA/8000
                a=sendonly

                '''
              rs.headers['content-length'] = rs.content.length
              rs.headers.to.params.tag = tag
              
              sip.send digest.signResponse context, rs
          else
            sip.send sip.makeResponse rq, 400
    catch e
      util.debug e
      util.debug e.stack

