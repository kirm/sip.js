// port of loom's project sip.js to node.js

var sys = require('sys');
var net = require('net');
var udp = require('./udp.js');
var dns = require('dns');

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

  var m = {headers:{}};

  if(!(parseResponse(data[0], m) || parseRequest(data[0], m)))
    return;

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

function parseMessage(s) {
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

function makeTcpTransport(listeners, onMessage, fix) {
  var connections = {};
  
  function makeId(target) { return [target.address, target.port].join('-'); };

  function init(stream, port, address) {
    var id = makeId({address: address, port: port});

    stream.setEncoding('ascii');
  
    stream.on('data', makeStreamParser(function(m) {onMessage(m, {protocol: 'TCP', address: address, port: port});}));
    stream.on('error', function() { delete connections[id]; });
    stream.on('close', function() { delete connections[id]; });
    stream.on('end', function() { 
      stream.end();
      delete connections[id];
    });

    stream.on('timeout', function() { stream.end(id); });
    stream.setTimeout(30000);
     
    var local = {protocol: 'TCP', address: stream.address().address, port: stream.address().port};

    return connections[id] = function(message) { stream.write(stringify(fix(message,local)));}
  }

  var servers = listeners.map(function(l) {
    var server = net.createServer(function(stream) { init(stream, stream.remotePort, stream.remoteAddress); });
    server.listen(l.port, l.address);
    return server;
  });

  function open(target) {
    var stream = net.createConnection(target.port, target.address);
    var pending = [];

    stream.on('error', function() {
      pending.forEach(function(m) {
        if(m.method)
          onMessage(makeResponse(m, 503));
      });
      delete connections[makeId(target)];
    });

    stream.on('connect', function() {
      pending.forEach(init(stream, target.port, target.address));
      pending = [];
    });

    return connections[makeId(target)] = function(message) { pending.push(message) };
  }

  return {
    send: function(target, message) { (connections[makeId(target)] || open(target))(message) },
    close: function() { servers.forEach(function(a) { a.close(); });}
  }
}

function makeUdpTransport(listeners, onMessage, fix) {
  var connections = {};

  function listener(message, rinfo) {
    try {
      var m = parseMessage(message.toString('ascii', 0, rinfo.size));
      if(m) onMessage(m, {protocol: 'UDP', address: rinfo.address, port: rinfo.port});
    }
    catch(e) {
      debug(e);
    }
  }

  var servers = listeners.map(function(l) {
    var socket = udp.createSocket(listener);
    socket.bind(l.port, l.address);
    return socket;
  });

  function open(target) {
    var socket = udp.createSocket(listener);
    socket.connect(target.port, target.address);
    socket.timestamp = new Date(); 
    
    connections[[target.address, target.port].join()] = socket;
    
    socket.on('close', function() { delete connections[[target.address, target.port].join()]; });
    socket.on('error', function() {
      if(socket.lastRequest)
        onMessage(makeResponse(socket.lastRequest, 503), {protocol: 'UDP', address: target.address, port: target.port});
      
      socket.close();
    });
    
    return socket;
  }

  var timer = setInterval(function() { 
    var now = new Date(); 
    Object.keys(connections).forEach(function(c) {
      var cn = connections[c];
      if(now - cn.timestamp > 30000)
        cn.close();
    });
  }, 30000);

  return {
    send: function(target, message) {
      var socket = connections[[target.address, target.port].join()] || open(target);
      socket.timestamp = new Date(); 
     
      if(message.method) socket.lastRequest = message;

      var s = stringify(fix(message, {protocol: 'UDP', address: socket.address().address, port: socket.address().port}));
      socket.send(new Buffer(s), 0, s.length);
    },
    close: function() {
      clearTimeout(timer);
      servers.forEach(function(x) { x.close(); });
      connections.forEach(function(x) { x.close(); });
    }
  }
}

//  Options: {
//    udp: true, 
//    tcp: true,
//    port: 5060,
//    onMessage: function(message, sender) {} 
//  }
//  return {
//    send: function(message, target),
//    close: function()
//  }
function makeTransport(options) {
  function fix(m, socket) {
    if(m.method) {
      var via = m.headers.via[0];
      via.protocol = socket.protocol;
      via.host = socket.address;
      via.port = 5060;
    }
    return m;
  }

  var u = makeUdpTransport([{port: 5060}], options.onMessage, fix);
  var t = makeTcpTransport([{port: 5060}], options.onMessage, fix);

  return {
    send: function(message, target) {
      switch(target.protocol.toUpperCase()) {
      case 'UDP':
        u.send(target, message);
        break;
      case 'TCP':
        t.send(target, message);
        break;
      default:
        if(message.method) options.onMessage(makeResponse(message, 503));
        break;
      }
    },
    close: function() { 
      u.close();
      t.close(); 
    } 
  };
}

exports.makeTransport = makeTransport;
exports.makeResponse = makeResponse;

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

function resolveTransaction(rq, transaction, tu) {
  if(rq.remote)
    return transaction(rq, rq.remote, transport, tu);

  resolve(parseUri(rq.uri), function(address) {
    var onresponse;
    
    address = (address || []).map(function(x) { return protocols.map(function(p) { return { protocol: p, address: x, port: uri.port || 5060};});})
      .reduce(function(arr,v) { return arr.concat(v); }, []);

    function next() {
      onresponse = next;
      if(address.length > 0)
        transaction(rq, address.shift(), transport, function(rs) { onresponse(rs); });
      else
        tu(makeResponse(rq, 404));
    }

    function searching(rs) {
      if(rs.status === 503)
        next();
      else if(rs.status > 100) {
        onresponse = tu;
      }
        
      tu(rs);
    }

    next();
  });
}

exports.resolve = resolve;

//transaction layer
function generateBranch() {
  return ['z9hG4bK',Math.round(Math.random()*1000000)].join('');
}

exports.generateBranch = generateBranch;

function makeTransactionLayer(options) {
  var transactions = {};

  function makeTransactionId(m) {
    if(m.method === 'ACK')
      return ['INVITE', m.headers['call-id'], m.headers.via[0].params.branch].join(';');

    return [m.headers.cseq.method, m.headers['call-id'], m.headers.via[0].params.branch].join(';');
  }

  function createInviteServerTransaction(rq, remote, transport, tu) {
    var id = makeTransactionId(rq);
    var sm = makeSM();
    var rs;
    
    var proceeding = {
      message: function() { 
        if(rs) transport(rs, remote);
      },
      send: function(message) {
        rs = message;

        if(message.status >= 300)
          sm.enter(completed);
        else if(message.status >= 200)
          sm.enter(succeeded);
      
        transport(rs, remote);
      }
    }

    var g, h;
    var completed = {
      enter: function () {
        g = setTimeout(function retry(t) { 
            setTimeout(retry, t*2, t*2);
            transport(rs, remote)
        });
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
          transport(rs, remote);
      }
    }

    var confirmed = { enter: function() { setTimeout(sm.enter.bind(sm, terminated), 5000); } };

    var succeeded = { enter: function() { sm.timeout(sm.enter.bind(sm, terminated), 5000);} };

    var terminated = { enter: function() { delete transactions[id]; } };
  
    sm.enter(proceeding);

    transactions[id] = {onMessage: sm.signal.bind(sm, 'message'), send: sm.signal.bind(sm, 'send')};

    tu(rq, remote);
  }

  function createServerTransaction(rq, remote, transport, tu) {
    var id = makeTransactionId(rq);
    var sm = makeSM();
    var rs;

    var trying = {
      message: function() { if(rs) transport(rs, remote); },
      send: function(message) {
        rs = message;
        transport(message, remote);
        if(message.status >= 200)
          sm.enter(completed);
      }
    } 

    var completed = {
      message: function() { transport(rs, remote); },
      enter: function() {
        setTimeout(function() { delete transactions[id]; }, 32000);
      }
    }

    sm.enter(trying);

    transactions[id] = {
      onMessage: sm.signal.bind(sm, 'message'),
      send: sm.signal.bind(sm, 'send')
    };

    tu(rq, remote);
  }

  function createInviteClientTransaction(rq, remote, transport, tu) {
    rq.headers.via.unshift({params: {branch: generateBranch()}});
    var id = makeTransactionId(rq);
    var sm = makeSM();

    var a;
    var b;
    var calling = {
      enter: function() {
        a = setTimeout(function resend(t) {
          transport(rq, remote);
          a = setTimeout(resend, t*2, t*2);
        }, 500, 500);
        
        b = setTimeout(function() {
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

        if(message.status < 200) {
          sm.enter(proceeding);
        }
        else if(message.status < 300) {
          sm.enter(terminated);
        }
        else {
          sm.enter(completed, message);
        }
      }
    };

    var proceeding = {
      message: function(message) {
        tu(message);
        if(message.status >= 200) {
          if(message.status < 300)
            sm.enter(terminated);
          else
            sm.enter(completed, message);
        }
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

        transport(ack, remote);

        setTimeout(sm.enter.bind(sm, terminated), 32000);
      },
      message: function(message) {
        transport(ack, remote);
      }
    };

    var terminated = {enter: function() { delete transactions[id]; }};
  
    transactions[id] = {onMessage: sm.signal.bind(sm, 'message')};
 
    sm.enter(calling);
 
    transport(rq, remote);    
  }
  
  function createClientTransaction(rq, remote, transport, tu) {  
    rq.headers.via.unshift({params: {branch: generateBranch()}});
    var id = makeTransactionId(rq);
    var sm = makeSM();
  
    var e;
    var f;
    var trying = {
      enter: function() {
        e = setTimeout(function() { sm.signal('timerE', 500); }, 500);
        f = setTimeout(function() { sm.signal('timerF'); }, 32000);
      },
      leave: function() {
        clearTimeout(e);
        clearTimeout(f);
      },
      message: function(message, remote) {
        tu(message, remote);
        if(message.status >= 200)
          sm.enter(completed);
        else
          sm.enter(proceeding);
      },
      timerE: function(t) {
        transport(rq, remote);
        e = setTimeout(function() { sm.signal('timerE', t*2); }, t*2);
      },
      timerF: function() {
        tu(makeResponse(rq, 503));
        sm.enter(terminated);
      }
    };

    var proceeding = trying;

    var completed = {
      enter: function (){
        setTimeout(function() { sm.enter(terminated); }, 5000);
      }
    };

    var terminated = {
      enter: function() { delete transactions[id]; }
    };

    sm.enter(trying);
    transport(rq, remote);

    transactions[id] = { onMessage: sm.signal.bind(sm, 'message') };
  }

  function onMessage(message, remote) {
    var trn = transactions[makeTransactionId(message)];

    if(trn) {
      trn.onMessage(message, remote);
    }
    else if(message.method) {
      switch(message.method) {
      case 'INVITE':
        createInviteServerTransaction(message, remote, options.transport, options.onMessage);
        break;
      case 'ACK':
        options.onMessage(message, remote);
        break;
      default:
        createServerTransaction(message, remote, options.transport, options.onMessage);
        break;
      }
    }
  }

  function send(message, callback) {
    if(message.method) {
      switch(message.method) {
      case 'INVITE':
        resolveTransaction(message, createInviteClientTransaction, options.transport, callback);
        break;
      case 'ACK':
        break;
      default:
        resolveTransaction(message, createClientTransaction, options.transport, callback);
        break;
      } 
    }
    else {
      var trn = transactions[makeTransactionId(message)];
      if(trn)
        trn.send(message);
    }
  }

  return {send: send, onMessage: onMessage};
}

exports.makeTransactionLayer = makeTransactionLayer;

exports.start = function(options) {
  var transport = makeTransport({
    listeners: options.listeners,
    onMessage: function(m,r) {
      transaction.onMesage(m,r);
    }
  });

  var transaction = makeTransactionLayer({
    transport: function(m,r) { transport.send(m,r) },
    onMessage: options.onMessage
  });

  return {send: transaction.send, close: transport.close};
}

