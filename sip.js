// port of loom's project sip.js to node.js

var sys = require('sys');
var net = require('net');
var dgram = require('dgram');

function parseResponse(rs, m) {
  var r = rs.match(/^SIP\/(\d\.\d)\s+(\d+)\s*(.*)\s*$/);

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
  debugger;
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

    if(!r)
      return;

    var name = r[1].toLowerCase();
    name = compactForm[name] || name;

    m.headers[name] = (parsers[name] || parseGenericHeader)({s:r[2], i:0}, m.headers[name]);
  }

  return m;
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
      return 'Via: SIP/'+via.version+'/'+via.protocol.toUpperCase()+' '+via.host+(via.port?':'+via.port:'')+stringifyParams(via.params)+'\r\n';
    }).join('');
  },
  to: function(h) {
    return 'To: '+stringifyAOR(h) + '\r\n';
   },
  from: function(h) {
    return 'From: '+stringifyAOR(h)+'\r\n';
  },
  contact: function(h) { 
    return 'Contact: '+ (h !== '*' && h.length) ? h.map(stringifyAOR).join(', ') : '*' + '\r\n'
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
    s = 'SIP/'+m.version + ' ' + m.status + ' ' + m.reason + '\r\n';
  }
  else {
    s = m.method + ' ' + m.uri + ' SIP/' + m.version + '\r\n';
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

function makeStreamParser(stream, onMessage) {
  var m;
  var r = '';
  
  function headers(data) {
    r += data;
    var a = r.split(/\r\n\r\n/);

    if(a.length > 1) {
      m = parse(a[0]);
      a.shift();
      r = a.join('\r\n\r\n');

      if(m && m.headers['content-length']) {
        state = content;
        content('');
      }
    }
  }

  function content(data) {
    r += data;

    if(r.length >= +m.headers['content-length']) {
      m.content = r.substring(0, m.headers['content-length']);
      onMessage(m, {protocol: 'TCP', address: stream.remoteAddress, port: stream.remotePort});
      var s = r.substring(m.headers['content-length']);
      state = headers;
      r = '';
      headers(s);
    }
  }

  var state=headers;
  stream.on('data', function(data) { state(data); });
  stream.on('end', function() {
    state('');
    stream.end();
  });
}

function makeDgramParser(socket, onMessage) {
  socket.on('message', function(s,rinfo) {
    var r=/^([\S\s]*)\r\n\r\n([\S\s]*)/.exec(s.toString('ascii'));

    if(r) {
      var m = parse(r[1]);
      
      if(m.headers['content-length']) {
        var c = Math.max(0, Math.min(m.headers['content-length'], r[2].length));
        m.content = r[2].substring(0, c);
      }
      else {
        m.content = r[2];
      }
      
      onMessage(m, {protocol: 'UDP', address: rinfo.address, port: rinfo.port});
    }
  });
}

//  Options: {
//    listeners: [ {protocol: 'UDP', port: 5060}, { protocol: 'TCP', port: 5060, address: '172.16.1.2' }],
//    sentBy: '172.16.1.2' // sentBy: function(remoteAddress) { if(remoteAddress.match(/^192\.168\./)) return '172.16.1.2'; return '80.34.54.15'; }
//    onMessage: function(message, sender) {} 
//  }
//  return {
//    send: function(message, target),
//    close: function()
//  }
function makeTransport(options) {
  var connections = {};

  function initConnection(stream, onMessage) {
    stream.setEncoding('ascii');

    var id = ['TCP', stream.remoteAddress, stream.remotePort].join(';');
    connections[id] = stream.write.bind(stream);

    stream.on('timeout', function() {
      delete connections[id];
      stream.end();
    });

    stream.setTimeout(30000);

    makeStreamParser(stream, onMessage);

    return connections[id];
  }

  function makeTcpServer(port, address, onMessage) {
    var server = net.createServer(function(stream) { initConnection(stream, onMessage) });
    server.listen(port, address);
    return server;
  }
  
  function makeUdpServer(port, address, onMessage) {
    var socket = dgram.createSocket('udp4');
    
    makeDgramParser(socket, onMessage);

    socket.bind(port, address);

    return socket;
  }

  var udpSocket;

  var servers = options.listeners.map(function(l) {
      switch(l.protocol) {
      case 'UDP':
        return (udpSocket = makeUdpServer(l.port, l.address, options.onMessage));
      case 'TCP':
        return makeTcpServer(l.port, l.address, options.onMessage); 
      }
  });

  function close() {
    servers.forEach(function(s) { try { s.close(); } catch(e) {} });
  }

  function connOpen(target, onError) {
    var stream = net.createConnection(target.port, target.addres);

    stream.on('error', onError);
  
    return makeConnection(stream);
  }

  function connGet(target) {
    return connections[[target.protocol, target.address, target.port].join(';')];
  }

  function fixMessageForSentBy(message, target) {
    var sentBy = (typeof options.sentBy === 'function') ? options.sentBy(target) : options.sentBy;

    if(message.method) {
      message.headers.via[0].protocol = target.protocol;
      message.headers.via[0].host = sentBy.host;
      message.headers.via[0].port = sentBy.port;
    }
  }

  function send(message, target) {
    fixMessageForSentBy(message, target);

    sys.debug(sys.inspect(target));

    if(target.protocol === 'UDP') {
      var str = stringify(message);
      udpSocket.send(new Buffer(str),0,str.length, target.port, target.address);
    }
    else {
      (connGet(target) || connOpen(target, isRequest(message) && function() { options.onMessage(makeResponse(message, 503)) }))(stringify(message));
    }
  }

  return { close: close, send: send };
}

exports.makeTransport = makeTransport;
exports.makeResponse = makeResponse;

