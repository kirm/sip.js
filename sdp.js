var util = require('sys');

function parseC(c) {
  var t = c.split(/\s+/);
  return { nettype: t[0], addrtype: t[1], address: t[2] };
}

var reM = /^(\w+) +(\d+)(?:\/(\d))? +(\S+) (\d+( +\d+)*)/;
function parseM(m) {
  var tmp = reM.exec(m);

  return {
    media: tmp[1], 
    port: +tmp[2],
    portnum: +(tmp[3] || 1),
    proto: tmp[4],
    fmt: tmp[5].split(/\s+/).map(function(x) { return +x; })
  };
}

function push(o,i,v) {
  switch(i) {
  case 'v':
  case 'o':
  case 's':
  case 'i':
  case 'u':
  case 'c':
    o[i] = v;
    break;
  default:
    if(o[i])
      o[i].push(v);
    else
      o[i] = [v];
    break;
  }
}

exports.parse = function(sdp) {
  var sdp = sdp.split(/\r\n/);
  
  var result = {};

  for(var i = 0; i < sdp.length; ++i) {
    var tmp = /^(\w)=(.*)/.exec(sdp[i]);

    if(tmp[1] === 'm') {
      break;
    }
    else {
      push(result, tmp[1], tmp[2]);
    }
  }

  result.m = [];

  for(;i< sdp.length; ++i) {
    var tmp = /(\w)=(.*)/.exec(sdp[i]);

    if(!tmp) break;

    if(tmp[1] === 'm') {
      result.m.push(parseM(tmp[2]));
    }
    else {
      var m = result.m[result.m.length-1];
      push(m, tmp[1], tmp[2]);
    }
  }

  if(result.c)
    result.c = parseC(result.c);

  result.m.forEach(function(m) {
    if(m.c)
      m.c = parseC(result.c);
  });

  return result;
};

var stringifiers = {
  o: function(o) {
    return [o.username || '-', o.id, o.version, o.nettype || 'IN', o.addrtype || 'IP4', o.address].join(' '); 
  },
  c: function(c) {
    return [c.nettype || 'IN', c.addrtype || 'IP4', c.address].join(' ');
  },
  m: function(m) {
    return [m.media || 'audio', m.port, m.transport || 'RTP/AVP', m.fmt.join(' ')].join(' ');
  }
};

function stringifyParam(sdp, type, def) {
  if(sdp[type] !== undefined) {
    var stringifier = function(x) { return type + '=' + ((stringifiers[type] && stringifiers[type](x)) || x) + '\r\n'; };

    if(Array.isArray(sdp[type]))
      return sdp[type].map(stringifier).join('');

    return stringifier(sdp[type]);
  }

  if(def !== undefined)
    return type + '=' + def + '\r\n';
  return '';
}

exports.stringify = function(sdp) {
  var s = '';
  
  s += stringifyParam(sdp, 'v', 0);
  s +=  stringifyParam(sdp, 'o');
  s +=  stringifyParam(sdp, 's', '-');
  s +=  stringifyParam(sdp, 'i');
  s +=  stringifyParam(sdp, 'u');
  s +=  stringifyParam(sdp, 'e');
  s +=  stringifyParam(sdp, 'p');
  s +=  stringifyParam(sdp, 'c');
  s +=  stringifyParam(sdp, 'b');
  s +=  stringifyParam(sdp, 't', '0 0');
  s +=  stringifyParam(sdp, 'r');
  s +=  stringifyParam(sdp, 'z');
  s +=  stringifyParam(sdp, 'k');
  s +=  stringifyParam(sdp, 'a');
  sdp.m.forEach(function(m) {
    s += stringifyParam({m:m}, 'm');
    s +=  stringifyParam(m, 'i');
    s +=  stringifyParam(m, 'c');
    s +=  stringifyParam(m, 'b');
    s +=  stringifyParam(m, 'k');
    s +=  stringifyParam(m, 'a');
  });

  return s;
}


