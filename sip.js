// port of loom's project sip.js to node.js

var sys = require('sys');
var net = require('net');
var udp = require('./udp.js');
var dns = require('dns');
var assert = require('assert');

function debug(e) {
  if(e.stack) {
    sys.debug(e + '\n' + e.stack);
  }
  else
    sys.debug(sys.inspect(e));
}

function parseResponse(rs, m) {
  var r = rs.match(/^SIP\/(\d+\.\d+)\s+(\d+)\s*(.*)\s*$/);

  if(r) {
    m.version = r[1];
    m.status = +r[2];
    m.reason = r[3];

    return m;
  }  
}

function parseRequest(rq, m) {
  var r = rq.match(/^([\w\-.!%*_+`'~]+)\s([^\s]+)\sSIP\s*\/\s*(\d+\.\d+)/);

  if(r) {
    m.method = r[1];
    m.uri = r[2];
    m.version = r[3];

    return m;
  }
}

function applyRegex(regex, data) {
  regex.lastIndex = data.i;
  var r = regex.exec(data.s);

  if(r && (r.index === data.i)) {
    data.i = regex.lastIndex;
    return r;
  }
}

function parseParams(data, hdr) {
  hdr.params = hdr.params || {};

  var re = /\s*;\s*([\w\-.!%*_+`'~]+)(?:\s*=\s*([\w\-.!%*_+`'~]+|"[^"\\]*(\\.[^"\\]*)*"))/g; 
  
  for(var r = applyRegex(re, data); r; r = applyRegex(re, data)) {
    hdr.params[r[1].toLowerCase()] = r[2];
  }

  return hdr;
}

function parseMultiHeader(parser, d, h) {
  h = h || [];

  var re = /\s*,\s*/g;
  do {
    h.push(parser(d));
  } while(d.i < d.s.length && applyRegex(re, d));

  return h;
}

function parseGenericHeader(d, h) {
  return h ? h + ',' + d.s : d.s;
}

function parseAOR(data) {
  var r = applyRegex(/((?:[\w\-.!%*_+`'~]+)(?:\s+[\w\-.!%*_+`'~]+)*|"[^"\\]*(?:\\.[^"\\]*)*")?\s*\<\s*([^>]*)\s*\>|((?:[^\s@"<]@)?[^;]+)/g, data);

  return parseParams(data, {name: r[1], uri: r[2] || r[3]});
}

function parseVia(data) {
  var r = applyRegex(/SIP\s*\/\s*(\d+\.\d+)\s*\/\s*([\S]+)\s+([^\s;:]+)(?:\s*:\s*(\d+))?/g, data);
  return parseParams(data, {version: r[1], protocol: r[2], host: r[3], port: +r[4]});
}

function parseCSeq(d) {
  var r = /(\d+)\s*([\S]+)/.exec(d.s);
  return { seq: +r[1], method: r[2] };
}

function parseAuthHeader(d) {
  var s = d.s;

  var r = /^([\S]*)\s*([^\s=]*)\s*=\s*([^\s,]|"[^"\\]*(\\.[^"\\]*)*")/.exec(s);
  var h = {scheme: r[1]};
  h[r[2]] = r[3];

  var re = /,([\s=]*)\s*=\s*([^\s,]|"[^"\\]*(\\.[^"\\]*)*")/g;

  re.lastIndex = r[0].length;

  while(r = applyRegex(re, d)) {
    h[r[1]] = r[2];
  }

  return h;
}

var compactForm = {
  i: 'call-id',
  m: 'contact',
  e: 'contact-encoding',
  l: 'content-length',
  c: 'content-type',
  f: 'from',
  s: 'subject',
  k: 'supported',
  t: 'to',
  v: 'via'
};

var parsers = {
  'to': parseAOR,
  'from': parseAOR,
  'contact': function(v, h) {
    if(v == '*')
      return v;
    else
      return parseMultiHeader(parseAOR, v);
  },
  'route': parseMultiHeader.bind(0, parseAOR),
  'cseq': parseCSeq,
  'content-length': function(v) { return +v.s; },
  'via': parseMultiHeader.bind(0, parseVia),
  'www-authenticate': parseMultiHeader.bind(0, parseAuthHeader),
  'proxy-authenticate': parseMultiHeader.bind(0, parseAuthHeader),
  'authorization': parseMultiHeader.bind(0, parseAuthHeader),
  'proxy-authorizarion': parseMultiHeader.bind(0, parseAuthHeader)
};

function parse(data) {
  data = data.split(/\r\n(?![ \t])/);

  if(data[0] === '')
    return;

  var m = {};

  if(!(parseResponse(data[0], m) || parseRequest(data[0], m)))
    return;

  m.headers = {};

  for(var i = 1; i < data.length; ++i) {
    var r = data[i].match(/^([\w\-.!%*_+`'~]+)\s*:\s*([\s\S]*)$/);

    if(!r) {
      return;
    }

    var name = r[1].toLowerCase();
    name = compactForm[name] || name;

    m.headers[name] = (parsers[name] || parseGenericHeader)({s:r[2], i:0}, m.headers[name]);
  }

  return m;
}

function parseUri(s) {
  if(typeof s === 'object')
    return s;

  var re = /^(sips?):(?:([^\s>:@]+)(?::([^\s@>]+))?@)([\w\-\.]+)(?::(\d+))?((?:;[^\s=\?>;]+(?:=[^\s?\;]+)?)*)(\?([^\s&=>]+=[^\s&=>]+)(&[^\s&=>]+=[^\s&=>]+)*)?$/;

  var r = re.exec(s);

  if(r) {
    return {
      schema: r[1],
      user: r[2],
      password: r[3],
      host: r[4],
      port: +r[5],
      params: (r[6].match(/([^;=]+)(=([^;=]+))?/g) || [])
        .map(function(s) { return s.split('='); })
        .reduce(function(params, x) { params[x[0]]=x[1] || null; return params;}, {}),
      headers: ((r[7] || '').match(/[^&=]+=[^&=]+/g) || [])
        .map(function(s){ return s.split('=') })
        .reduce(function(params, x) { params[x[0]]=x[1]; return params; }, {})
    }
  }
}

exports.parseUri = parseUri;

function stringifyVersion(v) {
  return v || '2.0';
}

function stringifyUri(uri) {
  if(typeof uri === 'string')
    return uri;

  var s = (uri.schema || 'sip') + ':';

  if(uri.user) {
    if(uri.passwd)
      s += uri.user + ':' + uri.password + '@';
    else
      s += uri.user + '@';
  }

  s += uri.host;

  if(uri.port)
    s += ':' + uri.port;

  if(uri.params)
    s += Object.keys(uri.params).map(function(x){return ';'+x+(uri.params[x] ? '='+uri.params[x] : '');}).join('');

  if(uri.headers) {
    var h = Object.keys(uri.headers).map(function(x){return x+'='+uri.headers[x];}).join('&');
    if(h.length)
      s += '?' + h; 
  }
  return s;
}

function stringifyParams(params) {
  var s = '';
  for(var n in params) {
      s += ';'+n+(params[n]?'='+params[n]:'');
  }

  return s;
}

function stringifyAOR(aor) {
  return (aor.name || '')+' <'+aor.uri+'>'+stringifyParams(aor.params); 
}

function stringifyAuthHeader(a) {
  var s = [];

  for(var n in a) {
    if(n !== 'scheme') {
      s.push(n + '=' + a[n]);
    }
  }

  return a.scheme + ' ' + s.join(',');
}

var stringifiers = {
  via: function(h) {
    return h.map(function(via) {
      return 'Via: SIP/'+stringifyVersion(via.version)+'/'+via.protocol.toUpperCase()+' '+via.host+(via.port?':'+via.port:'')+stringifyParams(via.params)+'\r\n';
    }).join('');
  },
  to: function(h) {
    return 'To: '+stringifyAOR(h) + '\r\n';
   },
  from: function(h) {
    return 'From: '+stringifyAOR(h)+'\r\n';
  },
  contact: function(h) { 
    return 'Contact: '+ ((h !== '*' && h.length) ? h.map(stringifyAOR).join(', ') : '*') + '\r\n';
  },
  cseq: function(cseq) { 
    return 'CSeq: '+cseq.seq+' '+cseq.method+'\r\n';
  },
  'www-authenticate': function(h) { 
    return h.map(function(x) { 'WWW-Authenticate: '+stringifyAuthHeader(x)+'\r\n'; }).join('');
  },
  'proxy-authenticate': function(h) { 
    return h.map(function(x) { 'Proxy-Authenticate: '+stringifyAuthHeader(x)+'\r\n'; }).join('');
  },
  'authorization': function(h) {
    return 'Authorization: ' + stringifyAuthHeader(h) + '\r\n';
  },
  'proxy-authorization': function(h) {
    return 'Proxy-Authorization: ' + stringifyAuthHeader(h) + '\r\n';
  }
};

function stringify(m) {
  var s;
  if(m.status) {
    s = 'SIP/' + stringifyVersion(m.version) + ' ' + m.status + ' ' + m.reason + '\r\n';
  }
  else {
    s = m.method + ' ' + stringifyUri(m.uri) + ' SIP/' + stringifyVersion(m.version) + '\r\n';
  }

  for(var n in m.headers) {
    if(typeof m.headers[n] === 'string' || !stringifiers[n]) 
      s += n + ': ' + m.headers[n] + '\r\n';
    else
      s += stringifiers[n](m.headers[n], n);
  }
  
  s += '\r\n';

  if(m.content)
    s += m.content;

  return s;
}

exports.stringify = stringify;

function makeResponse(rq, status, reason) {
  return {
    status: status,
    reason: reason || '',
    version: rq.version,
    headers: {
      via: rq.headers.via,
      to: rq.headers.to,
      from: rq.headers.from,
      'call-id': rq.headers['call-id'],
      cseq: rq.headers.cseq
    }
  };
}

exports.makeResponse = makeResponse;

function makeStreamParser(onMessage) {
  var m;
  var r = '';
  
  function headers(data) {
    r += data;
    var a = r.match(/^\s*([\S\s]*?)\r\n\r\n([\S\s]*)$/);

    if(a) {
      r = a[2];
      m = parse(a[1]);

      if(m && m.headers['content-length'] !== undefined) {
        state = content;
        content('');
      }
    }
  }

  function content(data) {
    r += data;

    if(r.length >= m.headers['content-length']) {
      m.content = r.substring(0, m.headers['content-length']);
      
      onMessage(m);
      
      var s = r.substring(m.headers['content-length']);
      state = headers;
      r = '';
      headers(s);
    }
  }

  var state=headers;

  return function(data) { state(data); }
}
exports.makeStreamParser = makeStreamParser;

function parseMessage(s) {
  sys.debug(s);
  var r=/^([\S\s]*?)\r\n\r\n([\S\s]*)/.exec(s.toString('ascii'));

  if(r) {
    var m = parse(r[1]);

    if(m.headers['content-length']) {
      var c = Math.max(0, Math.min(m.headers['content-length'], r[2].length));
      m.content = r[2].substring(0, c);
    }
    else {
      m.content = r[2];
    }
      
    return m;
  }
}
exports.parse = parseMessage;

function makeTcpTransport(options, callback) {
  var connections = Object.create(null);

  function init(stream, remote) {
    var id = [remote.address, remote.port].join(),
        local = {protocol: 'TCP', address: stream.address().address, port: stream.address().port},
        pending = [],
        refs = 0;

    function send(m) {
      try {
        if(stream.readyState === 'opening')
          pending.push(m);
        else
          stream.write(m, 'ascii');
      }
      catch(e) {
        process.nextTick(stream.emit.bind(stream, 'error', e));
      }
    }
    
    stream.setEncoding('ascii');
    stream.on('data',     makeStreamParser(function(m) { callback(m, remote); }));
    stream.on('close',    function() { delete connections[id]; });
    stream.on('error',    function() {});
    stream.on('end',      function() { if(refs === 0) stream.end(); });
    stream.on('timeout',  function() { if(refs === 0) stream.end(); });
    stream.on('connect',  function() { pending.splice(0).forEach(send); });
    stream.setTimeout(60000);   
 
    connections[id] = function(onError) {
      ++refs;
      if(onError) stream.on('error', onError);

      return {
        release: function() {
          if(onError) stream.removeListener('error', onError);

          if(--refs === 0) {
            if(stream.readyState === 'writeOnly')
              stream.end();
            else
              setTimeout(60000);
          }
        },
        send: send,
        local: local
      }
    };
    
    return connections[id];
  }
  
  var server = net.createServer(function(stream) {
    init(stream, {protocol: 'TCP', address: stream.remoteAddress, port: stream.remotePort});
  });

  server.listen(options.port || 5060, options.address);
  
  return {
    open: function(remote, error, dontopen) {
      var id = [remote.address, remote.port].join();

      if(id in connections) return connections[id](error);

      if(dontopen) return null;

      return init(net.createConnection(remote.port, remote.address), remote)(error);
    },
    destroy: function() { server.close(); }
  }
}

function makeUdpTransport(options, callback) {
  var connections = Object.create(null);

  function listener(data, rinfo) {
    callback(parseMessage(data), {protocol: 'UDP', address: rinfo.address, port: rinfo.port});
  };

  var socket = udp.createSocket(listener);

  socket.bind(options.port || 5060, options.address);
  
  function open(remote) {
    var socket = udp.createSocket(listener),
        id = [remote.address, remote.port].join(),
        local,
        refs = 0,
        timeout;
    
    socket.bind(options.port || 5060, options.address);
    socket.connect(remote.port, remote.address);
    
    local = {protocol: 'UDP', address: socket.address().address, port: socket.address().port};
    
    socket.on('error', function() {});
    socket.on('close', function() { delete connections[id]; });

    return connections[id] = function(onError) {
      ++refs;
      
      if(timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      if(onError) socket.on('error', onError);

      return { 
        send: function(m) {
          socket.send(new Buffer(m, 'ascii'), 0, m.length);
        },
        release: function() { 
          if(onError) socket.removeListener('error', onError);
          
          if(--refs === 0)
            timeout = setTimeout(socket.close.bind(socket), 30000);
        },
        local: local
      };
    };
  };
 
  return {
    open: function(remote, error) { 
      return (connections[[remote.address, remote.port].join()] || open(remote))(error);
    },
    destroy: function() { socket.close(); }
  };
}

function makeTransport(options, callback) {
  var protocols = {};

  var callbackAndLog = callback;
  if(options.logger && options.logger.recv) {
    callbackAndLog = function(m, remote) {
      options.logger.recv(m, remote);
      callback(m, remote);
    }
  }
  
  if(options.udp === undefined || options.udp)
    protocols.UDP = makeUdpTransport(options, callbackAndLog); 
  if(options.tcp === undefined || options.tcp)
    protocols.TCP = makeTcpTransport(options, callbackAndLog);

  function wrap(obj, target) {
    return Object.create(obj, {send: {value: function(m) {
      if(m.method) {
        m.headers.via[0].host = this.local.address;
        m.headers.via[0].port = options.port || 5060;
        m.headers.via[0].protocol = this.local.protocol;
      }
      options.logger && options.logger.send && options.logger.send(m, target);
      obj.send(stringify(m));
    }}});
  }

  return {
    open: function(target, error) {
      return wrap(protocols[target.protocol.toUpperCase()].open(target, error), target);
    },
    send: function(target, message) {
      var cn = this.open(target);
      try {
        cn.send(message);
      }
      finally {
        cn.release();
      }
    },
    destroy: function() { 
      Object.keys(protocols).forEach(function(key) { protocols[key].destroy(); });
    },
  };
}

exports.makeTransport = makeTransport;

function resolve(uri, action) {
  if(uri.host.match(/^\d{1,3}(\.\d{1,3}){3}$/))
    return action([{protocol: uri.params.transport || 'UDP', address: uri.host, port: uri.port || 5060}]);

  var protocols = uri.params.protocol ? [uri.params.protocol] : ['UDP', 'TCP'];
  dns.resolve4(uri.host, function(err, address) {
    address = (address || []).map(function(x) { return protocols.map(function(p) { return { protocol: p, address: x, port: uri.port || 5060};});})
      .reduce(function(arr,v) { return arr.concat(v); }, []);
    action(address);
  });
}

exports.resolve = resolve;

//transaction layer
function generateBranch() {
  return ['z9hG4bK',Math.round(Math.random()*1000000)].join('');
}

exports.generateBranch = generateBranch;

function makeSM() {
  var state;

  return {
    enter: function(newstate) {
      if(state && state.leave)
        state.leave();
      
      state = newstate;
      Array.prototype.shift.apply(arguments);
      if(state.enter) 
        state.enter.apply(this, arguments);
    },
    signal: function(s) {
      if(state && state[s]) 
        state[Array.prototype.shift.apply(arguments)].apply(state, arguments);
    }
  };
}

function createInviteServerTransaction(transport, cleanup) {
  var sm = makeSM();
  var rs;
    
  var proceeding = {
    message: function() { 
      if(rs) transport(rs);
    },
    send: function(message) {
      rs = message;

      if(message.status >= 300)
        sm.enter(completed);
      else if(message.status >= 200)
        sm.enter(accepted);
      
      transport(rs);
    }
  }

  var g, h;
  var completed = {
    enter: function () {
      g = setTimeout(function retry(t) { 
        setTimeout(retry, t*2, t*2);
        transport(rs)
      }, 500, 500);
      h = setTimeout(sm.enter.bind(sm, terminated), 32000);
    },
    leave: function() {
      clearTimeout(g);
      clearTimeout(h);
    },
    message: function(m) {
      if(m.method === 'ACK')
        sm.enter(confirmed)
      else
        transport(rs);
    }
  }
  
  var confirmed = {enter: function() { setTimeout(sm.enter.bind(sm, terminated), 5000);} };

  var accepted = {
    enter: function() { setTimeout(sm.enter.bind(sm, terminated), 32000);},
    send: function(m) { 
      rs = m;
      transport(rs);
    }  
  };

  var terminated = {enter: cleanup};
  
  sm.enter(proceeding);

  return {send: sm.signal.bind(sm,'send'), message: sm.signal.bind(sm,'message')};
}

function createServerTransaction(transport, cleanup) {
  var sm = makeSM();
  var rs;

  var trying = {
    message: function() { if(rs) transport(rs); },
    send: function(m) {
      rs = m;
      transport(m);
      if(m.status >= 200) sm.enter(completed);
    }
  }; 

  var completed = {
    message: function() { transport(rs); },
    enter: function() { setTimeout(cleanup, 32000); }
  };

  sm.enter(trying);

  return {send: sm.signal.bind(sm, 'send'), message: sm.signal.bind(sm, 'message')};
}

function createInviteClientTransaction(rq, transport, tu, cleanup) {
  var sm = makeSM();

  var a, b;
  var calling = {
    enter: function() {
      transport(rq);

      if(!transport.reliable) {
        a = setTimeout(function resend(t) {
          transport(rq);
          a = setTimeout(resend, t*2, t*2);
        }, 500, 500);
      }
        
      b = setTimeout(function() {
        sys.debug('timeout');
        tu(makeResponse(rq, 503));
        sm.enter(terminated);
      }, 32000);
    },
    leave: function() {
      clearTimeout(a);
      clearTimeout(b);
    },
    message: function(message) {
      tu(message);

      if(message.status < 200)
        sm.enter(proceeding);
      else if(message.status < 300) 
         sm.enter(accepted);
      else
        sm.enter(completed, message);
    }
  };

  var proceeding = {
    message: function(message) {
      tu(message);
      
      if(message.status >= 300)
        sm.enter(completed, message);
      else if(message.status >= 200)
        sm.enter(accepted);
    }
  };

  var ack;
  var completed = {
    enter: function(rs) {
      ack = {
        method: 'ACK',
        uri: rq.uri,
        headers: {
          to: rs.headers.to,
          from: rq.headers.from,
          cseq: {method: 'ACK', seq: rq.headers.cseq.seq},
          'call-id': rq.headers['call-id'],
          via: [rq.headers.via[0]]
        }
      };

      transport(ack);

      setTimeout(sm.enter.bind(sm, terminated), 32000);
    },
    message: function(message, remote) {
      if(remote) transport(ack);  // we don't want to ack internally generated messages
    }
  };

  var accepted = {
    enter: function() {
      setTimeout(function() { sm.enter(terminated); }, 32000);
    },
    message: function(m) {
      if(m.status >= 200 && m.status <= 299)
        tu(message);
    }
  };

  var terminated = {enter: cleanup};
 
  sm.enter(calling);
 
  return {message: sm.signal.bind(sm, 'message')};
}

function createClientTransaction(rq, transport, tu, cleanup) {  
  assert.ok(rq.method !== 'INVITE');

  var sm = makeSM();
  
  var e, f;
  var trying = {
    enter: function() { 
      transport(rq);
      if(!transport.reliable)
        e = setTimeout(function() { sm.signal('timerE', 500); }, 500);
      f = setTimeout(function() { sm.signal('timerF'); }, 32000);
    },
    leave: function() {
      clearTimeout(e);
      clearTimeout(f);
    },
    message: function(message, remote) {
      tu(message);
      if(message.status >= 200)
        sm.enter(completed);
      else
        sm.enter(proceeding);
    },
    timerE: function(t) {
      transport(rq);
      e = setTimeout(function() { sm.signal('timerE', t*2); }, t*2);
    },
    timerF: function() {
      sys.debug('timerF' + rq.method);
      tu(makeResponse(rq, 503));
      sm.enter(terminated);
    }
  };

  var proceeding = trying;

  var completed = {enter: function () { setTimeout(function() { sm.enter(terminated); }, 5000); } };

  var terminated = {enter: cleanup};

  sm.enter(trying);

  return {message: sm.signal.bind(sm, 'message')};
}

function makeTransactionId(m) {
  if(m.method === 'ACK')
    return ['INVITE', m.headers['call-id'], m.headers.via[0].params.branch].join();
  return [m.headers.cseq.method, m.headers['call-id'], m.headers.via[0].params.branch].join();
}
 
function makeTransactionLayer(options, transport) {
  var transactions = Object.create(null);

  return {
    createServerTransaction: function(rq, remote) {
      var id = makeTransactionId(rq);
      var cn = transport(remote, function() {}, true);
      return transactions[id] = (rq.method === 'INVITE' ? createInviteServerTransaction : createServerTransaction)(
        cn.send.bind(cn),
        function() { 
          delete transactions[id];
          cn.release();
        });
    },
    createClientTransaction: function(rq, callback) {
      rq.headers.via.unshift({params:{}});

      var transaction = rq.method === 'INVITE' ? createInviteClientTransaction : createClientTransaction;

      resolve(parseUri(rq.uri), function(address) {
        var onresponse;

        function next() {
          onresponse = searching;
          if(address.length > 0) {
            rq.headers.via[0].params.branch = generateBranch();
            
            var id = makeTransactionId(rq);

            var cn = transport(address.shift(), function(e) { sys.debug(e.stack); transactions[id].message(makeResponse(rq, 503));}); 
            var send = cn.send.bind(cn);
            send.reliable = cn.local.protocol.toUpperCase() !== 'UDP';            

            transactions[id] = transaction(rq, send, callback, function() { 
              delete transactions[id];
              cn.release();
            });
          }
          else
            callback(makeResponse(rq, 404));
        }

        function searching(rs) {
          if(rs.status === 503)
            next();
          else if(rs.status > 100) {
            onresponse = callback;
        }
        
        callback(rs);
      }

      next();
    });
  },
  get: function(m) {
    return transactions[makeTransactionId(m)];
  }};
}

exports.makeTransactionLayer = makeTransactionLayer;

exports.create = function(options, callback) {
  var transport = makeTransport(options, function(m,remote) {
    var t = transaction.get(m);

    if(!t) {
      if(m.method && m.method !== 'ACK') {
        var t = transaction.createServerTransaction(m,remote);
        callback(m,remote); 
      }
      else if(m.headers.cseq.method === 'INVITE' || m.method === 'ACK') {
        callback(m,remote);
      }
    }
    else {
      t.message && t.message(m, remote);
    }
  });
  
  var transaction = makeTransactionLayer(options, transport.open.bind(transport));

  return {
    send: function(m, callback) {
      var t = transaction.get(m);
      
      if(t) {
        t.send && t.send(m);
      }
      else {
        if(m.method) {
          if(m.method === 'ACK') {
            resolve(parseUri(m.uri), function(address) {
              if(address.length === 0) return;
            
              var cn = transport.open(address);
              try {
                cn.send(m);
              } finally {
                cn.release();
              }
            });
          }
          else {
            return transaction.openClientTransaction(m, callback || function() {});
          }
        }
      }
    },
    destroy: transport.destroy.bind(transport)
  } 
}

exports.start = function(options, callback) {
  var r = exports.create(options, callback);

  exports.send = r.send;
  exports.stop = r.destroy;
}

