SIP.js API
==========

sip.js простая реализация протокола SIP.

Включает:

* Парсер/Сериализатор сообщений
* Транспорт с поддержкой протоколов UDP и TCP
* Тразакции

Пример использования
--------------------

SIP узел перенаправляющий все запросы на узел 'backup.somewhere.net'

    var sip = require('sip');
  
    sip.start({}, function(request) {
      var response = sip.makeResponse(request, 302, 'Moved Temporarily');

      var uri = sip.parseUri(request.uri);
      uri.host = 'backup.somewhere.net'; 
      response.headers.contact = [{uri: uri}];
    
      sip.send(response);
    });

Сообщения
---------

Сообщения представляются в виде javascript объектов. Например сообщение

    INVITE sip:service@172.16.2.2:5060 SIP/2.0
    Via: SIP/2.0/UDP 127.0.1.1:5060;branch=z9hG4bK-1075-1-0
    From: sipp <sip:sipp@127.0.1.1:5060>;tag=1075SIPpTag001
    To: sut <sip:service@172.16.2.2:5060>
    Call-ID: 1-1075@127.0.1.1
    CSeq: 1 INVITE
    Contact: sip:sipp@127.0.1.1:5060
    Max-Forwards: 70
    Subject: Performance Test
    Content-Type: application/sdp
    Content-Length:   127

    v=0
    o=user1 53655765 2353687637 IN IP4 127.0.1.1
    s=-
    c=IN IP4 127.0.1.1
    t=0 0
    m=audio 6000 RTP/AVP 0
    a=rtpmap:0 PCMU/8000
    
Будет представленно как

    { method: 'INVITE'
    , uri: 'sip:service@172.16.2.2:5060'
    , version: '2.0'
    , headers: 
       { via: 
          [ { version: '2.0'
            , protocol: 'UDP'
            , host: '127.0.1.1'
            , port: 5060
            , params: { branch: 'z9hG4bK-1075-1-0' }
            }
          ]
       , from: 
          { name: 'sipp'
          , uri: 'sip:sipp@127.0.1.1:5060'
          , params: { tag: '1075SIPpTag001' }
          }
       , to: 
          { name: 'sut'
          , uri: 'sip:service@172.16.2.2:5060'
          , params: {}
          }
       , 'call-id': '1-1075@127.0.1.1'
       , cseq: { seq: 1, method: 'INVITE' }
       , contact: 
          [ { name: undefined
            , uri: 'sip:sipp@127.0.1.1:5060'
            , params: {}
            }
          ]
       , 'max-forwards': '70'
       , subject: 'Performance Test'
       , 'content-type': 'application/sdp'
       , 'content-length': 127
       }
    , content: 'v=0\r\no=user1 53655765 2353687637 IN IP4 127.0.1.1\r\ns=-\r\nc=IN IP4 127.0.1.1\r\nt=0 0\r\nm=audio 6000 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000'
    }    

Представление SIP ответов отличается от запросов тем, что вместо членов `method` и `uri` содержат члены `status` и `reason`.

##Высокоуровневый интерфейc

### sip.start(options, onRequest)

Стартует SIP стек. 

`options` - javascript объект содержащий именованные опции. 

* `port` - порт используемый транспортом. По умолчанию 5060.
* `address` - локальный адрес используемый транспортом. По умолчанию используются все локальные адреса.
* `udp` - разрешение использовать протокол UDP для транспорта. По умолчанию true.
* `tcp` - разрешение использовать протокол TCP для транспорта. По умолчанию true.

`onRequest` - callback функция вызываемая при получении нового запроса. При вызове первым параметром
передается распарсенный запрос, вторым javascript объект содержщий протокол, адрес и порт узла с которого
было получено сообщение. Например: `{ protocol: 'TCP', address: '192.168.135.11', port: 50231 }`

### sip.stop

Останавливает SIP стек.

### sip.send(message[, callback])

Посылка SIP сообщения.

Если `message` является запросом (кроме метода `'ACK'`), то создается новая клиентская транзакция и 
сообщение передается ей. При этом в сообщения добавляется новый заголовок `'Via'` (кроме метода `'CANCEL'`).
Если был указан опциональный параметр `callback`, то он будет вызыватся при приеме ответов на посланный
запрос.

Если `message` являтся ответом, то сообщнение посылается с помощью соответсвующей cерверной транзакии.

## Вспомогательные функции

### sip.makeResponse(request, status[, reason])

возвращает ответ на запрос `request` со статусом `status` и пояснением `reason`.

### sip.parseUri(uri)

возвращает разобранный sip uri.

### sip.stringifyUri(uri)

возращает строковое представление разобранного uri.

### sip.parse(message)

разбирает сообщение

### sip.stringify(message)

делает строку с SIP сообщением из javascript объекта представляющего сообщение.

### sip.copyMessage(message[, deep])

копирует сообщение. Если параметр `deep` пропущен или имеет ложное значение то копируются поля `method`, `uri`, `status`, 
`reason`, `headers`, `content` корневого объекта и массив `headers.via`. Если параметр `deep` имеет истинное значение то производится 
полная рекурсивная копия.

## Модуль proxy

В sip.js включен модуль облегчающий создание proxy-серверов. Получить ссылку на модуль можно вызвав `require('sip/proxy')`.
Пример использования:

    var sip = require('sip');
    var proxy = require('sip/proxy');
    var db = require('userdb');

    proxy.start({}, function(rq) {
      var user = sip.parseUri(rq.uri).user;

      if(user) {
        rq.uri = db.getContact(user);

        proxy.send(rq);
      }
      else
        proxy.send(sip.makeResponse(rq, 404, 'Not Found')); 
    });


### proxy.start(options, onRequest)

Запуск proxy и SIP стека. параметры аналогичны `sip.start`

### proxy.stop

Остановка proxy и SIP стека.

### proxy.send(msg[, callback])

Отвечать на входящие запросы и совершать новые запросы в их контексте следует с помощью этой функции. Proxy  автоматически
обратывает отмену вхожящих запросов и посылает запросы `CANCEL` для исходящих запросов. Исходящие запросы связываюся с входящими
с помощью первого заголовка `Via`.
Если при посылке запроса опустить параметр `callback` будет использован обработчик по умолчанию:

    function defaultProxyCallback(rs) {
      // удаляем первый заголовок Via
      rs.headers.via.shift();

      // Посылаем ответ на связанный входящий запрос
      proxy.send(rs);
    } 


