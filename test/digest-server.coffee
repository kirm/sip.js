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

context = undefined
regcontext = undefined

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
            if !rq.headers.authorization || !digest.server.authenticate regcontext, rq, rq.headers.authorization
              regcontext = {nonce: (rbytes 16), qop: ['auth', 'auth-int'], algorithm:'MD5', user: '100', passwd: '1234', realm: '172.16.2.12'}
              rs = sip.makeResponse rq, 407, 'Authorization Required'
              rs.headers['www-authenticate'] = [digest.server.makeAuthenticateHeader regcontext]
              sip.send rs
            else
              rs = sip.makeResponse rq, 200
              rs.headers.to.tag = rbytes 16
              sip.send rs
          when 'INVITE'
            if !rq.headers.authorization
              context = {nonce: (rbytes 16), qop: 'auth-int', algorithm:'MD5', user: '100', passwd: '1234', realm: 'sip'}
              rs = sip.makeResponse rq, 407, 'Authorization Required'
              rs.headers['www-authenticate'] = [digest.server.makeAuthenticateHeader context]
              sip.send rs
            else
              if digest.server.authenticate context, rq, rq.headers.authorization
                tag = rbytes 16
                dialogs[makeDialogId rq, tag] = (rq) ->
                  try
                    if !rq.headers.authorization || !digest.server.authenticate context, rq, rq.headers.authorization
                      rs = sip.makeResponse rq, 407, 'Authorization Required'
                      rs.headers['www-authenticate'] = [digest.server.makeAuthenticateHeader context]
                      sip.send rs
                    else
                      switch rq.method
                        when 'BYE'
                          sip.send sip.makeResponse rq, 200
                          delete dialogs[makeDialogId rq, tag]
                        else
                          sip.send sip.makeResponse rq, 400
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
                rs.headers['authentication-info'] = digest.server.makeAuthenticationInfoHeader context, true
                sip.send rs
              else
                context.nonce = rbytes 16
                rs = sip.makeResponse rq, 407, 'Authorization Required'
                rs.headers['www-authenticate'] = [digest.server.makeAuthenticateHeader context]
                sip.send rs
          else
            sip.send sip.makeResponse rq, 400
    catch e
      util.debug e
      util.debug e.stack

