var crypto = require('crypto');
var util = require('util');

function unq(a) {
  if(a && a[0] === '"' && a[a.length-1] === '"')
    return a.substr(1, a.length - 2);
  return a;
}

function q(a) {
  if(a && a[0] !== '"')
    return ['"', a, '"'].join('');
  return a;
}

function lowercase(a) {
  if(typeof a === 'string')
    return a.toLowerCase();
  return a;
}

function kd() {
  var hash = crypto.createHash('md5');

  var a = Array.prototype.join.call(arguments, ':');
  util.debug(a);
  hash.update(a);

  return hash.digest('hex');
}
exports.kd = kd;

function rbytes() {
  return kd(Math.random().toString(), Math.random().toString());
}

function calculateUserRealmPasswordHash(user, realm, password) {
  return kd(unq(user), unq(realm), unq(password));
}
exports.calculateUserRealmPasswordHash = calculateUserRealmPasswordHash;

function calculateDigest(ha1, method, nonce, nc, cnonce, qop, uri, entity) {
  switch(qop) {
  case 'auth-int':
    return kd(ha1, nonce, nc, cnonce, qop, kd(method, uri + kd(entity)));
  case 'auth':
    return kd(ha1, nonce, nc, cnonce, qop, kd(method, uri));
  }

  return kd(ha1, nonce, kd(method, uri));
}
exports.calculateDigest = calculateDigest;

function numberTo8Hex(n) {
  n = n.toString(16);
  return '00000000'.substr(n.length) + n;
}

function findDigestRealm(headers, realm) {
  if(!realm) return headers && headers[0];
  return headers && headers.filter(function(x) { return x.scheme === 'Digest' && unq(x.realm) === realm; })[0];
}

function selectQop(challenge, preference) {
  if(!challenge)
    return;

  challenge = unq(challenge).split(',');
  if(!preference)
    return challenge[0];

  if(typeof(preference) === 'string') 
    preference = preference.split(',');

  for(var i = 0; i !== preference.length; ++i)
    for(var j = 0; j !== challenge.length; ++j)
      if(challenge[j] === preference[i])
        return challenge[j];

  throw new Error('failed to negotiate protection quality');
}

exports.challenge = function(ctx, rs) {
  ctx.proxy = rs.status === 407;

  ctx.nonce = rbytes();
  ctx.nc = 0;
  ctx.qop = ctx.qop || 'auth,auth-int';
  ctx.algorithm = ctx.algorithm || 'md5';


  var hname = ctx.proxy ? 'proxy-authenticate' : 'www-authenticate';
  (rs.headers[hname] || (rs.headers[hname]=[])).push(
    {
      scheme: 'Digest',
      realm: q(ctx.realm),
      qop: q(ctx.qop),
      algorithm: q(ctx.algoritm),
      nonce: q(ctx.nonce),
      opaque: q(ctx.opaque)
    }
  );

  return rs;
}

exports.authenticateRequest = function(ctx, rq, creds) {
  var response = findDigestRealm(rq.headers[ctx.proxy ? 'proxy-authorization': 'authorization'], ctx.realm);

  if(!response) return false;

  var cnonce = unq(response.cnonce);
  var uri = unq(response.uri);
  var qop = unq(lowercase(response.qop));

  ctx.nc = (ctx.nc || 0) +1;
  
  if(!ctx.ha1) {
    ctx.userhash = creds.hash || calculateUserRealmPasswordHash(creds.user, ctx.realm, creds.password);
    ctx.ha1 = ctx.userhash;
    if(ctx.algoritm === 'md5-sess')
      ctx.ha1 = kd(ctx.userhash, ctx.nonce, cnonce);
  }
  
  var digest = calculateDigest(ctx.ha1, rq.method, ctx.nonce, numberTo8Hex(ctx.nc), cnonce, qop, uri, rq.entity);

  if(digest === unq(response.response)) {
    ctx.cnonce = cnonce;
    ctx.uri = uri;
    ctx.qop = qop;

    return true;
  } 

  return false;
}

exports.signResponse = function(ctx, rs) {
  var nc = numberTo8Hex(ctx.nc);
  rs.headers['authentication-info'] = {
    qop: q(ctx.qop),
    cnonce: q(ctx.cnonce),
    nc: nc,
    rspauth: q(calculateDigest(ctx.ha1, '', ctx.nonce, nc, ctx.cnonce, ctx.qop, ctx.uri, rs.entity))
  };
  return rs;
}

function initClientContext(ctx, rs, creds) {
  var challenge;

  if(rs.status === 407) {
    ctx.proxy = true;
    challenge = findDigestRealm(rs.headers['proxy-authenticate'], creds.realm);
  }
  else
    challenge = findDigestRealm(rs.headers['www-authenticate'], creds.realm);
  
  if(ctx.nonce !== unq(challenge.nonce)) {
    ctx.nonce = unq(challenge.nonce);

    ctx.algorithm = unq(lowercase(challenge.algorithm));
    ctx.qop = selectQop(lowercase(challenge.qop), ctx.qop);
 
    if(ctx.qop) {
      ctx.nc = 0;
      ctx.cnonce = rbytes();
    }

    ctx.realm = unq(challenge.realm);
    ctx.user = creds.user;
    ctx.userhash = creds.hash || calculateUserRealmPasswordHash(creds.user, ctx.realm, creds.password);
    ctx.ha1 = ctx.userhash;

    if(ctx.algorithm === 'md5-sess')
      ctx.ha1 = kd(ctx.ha1, ctx.nonce, ctx.cnonce);

    ctx.domain = unq(challenge.domain);
 }

  ctx.opaque = unq(challenge.opaque);
}

exports.signRequest = function (ctx, rq, rs, creds) {
  if(rs)
    initClientContext(ctx, rs, creds);

  var nc = ctx.nc !== undefined ? numberTo8Hex(++ctx.nc) : undefined;

  ctx.uri = rq.uri;
  
  var signature = {
    scheme: 'Digest',
    realm: q(ctx.realm),
    username: q(ctx.user),
    nonce: q(ctx.nonce), 
    uri: q(rq.uri),
    nc: nc,
    algorithm: q(ctx.algorithm),
    cnonce: q(ctx.cnonce),
    qop: q(ctx.qop),
    opaque: q(ctx.opaque),
    response: q(calculateDigest(ctx.ha1, rq.method, ctx.nonce, nc, ctx.cnonce, ctx.qop, ctx.uri, rq.content))    
  };

  var hname = ctx.proxy ? 'proxy-authorization' : 'authorization'; 
 
  rq.headers[hname] = (rq.headers[hname] || []).filter(function(x) { return unq(x.realm) !== ctx.realm; });
  rq.headers[hname].push(signature);

  return rq;
}

exports.authenticateResponse = function(ctx, rs) {
  var signature = rs.headers[ctx.proxy ? 'proxy-authentication-info' : 'authentication-info'];

  if(!signature) return undefined;

  if(calculateResponse(ctx.ha1, '', ctx.nonce, numberTo8Hex(ctx.nc), ctx.cnonce, ctx.qop, ctx.uri, rs.content) === unq(signature.rspauth)) {
    var nextnonce = unq(signature.nextnonce);
    if(nextnonce && nextnonce !== ctx.nonce) {
      ctx.nonce = nextnonce;
      ctx.nc = 0;

      if(ctx.algorithm === 'md5-sess') 
        ctx.ha1 = kd(ctx.userhash, ctx.nonce, ctx.cnonce);
    }

    return true;
  }
 
  return false;
}


