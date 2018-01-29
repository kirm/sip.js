"use strict";

let sip = require("../");
let fs = require("fs");
let path= require("path");

function handleKeepAlive(success) {

    let isSuccess= false; 

    let rawMessageAsBinaryString= fs.readFileSync(path.join(__dirname, "messages", "baddate.dat"), "binary");

    let streamParser = sip.makeStreamParser(
        function (sipPacket) {

            isSuccess= true;

            console.log("ok test handleKeepAlive");

            success();

        }
    );

    for( let i=0; i<20000; i++)
        streamParser("\r\n");

    streamParser(rawMessageAsBinaryString);

    console.assert(isSuccess, "Message has not been parsed");

}

function flood(success) {

    let isSuccess= false;

    let onMessage= function(sipPacket){ 

        console.assert(false, "Message should not have been parsed"); 

    };

    let onFlood= function(){

        isSuccess= true;

        console.log("ok test flood");

        success();

    }

    let maxBytesHeaders= 6048;

    let streamParser = sip.makeStreamParser(onMessage, onFlood, maxBytesHeaders);

    let floodData= "";

    for (let i = 0; i < maxBytesHeaders; i++){

        floodData+= "x";

    }

    streamParser(floodData);

    streamParser("OVERFLOW!");

    console.assert(isSuccess, "We have been buffering flood data");

}

function payloadFlood(success) {

    let isSuccess = false;

    let split = fs
        .readFileSync(
        path.join(__dirname, "messages", "baddate.dat"),
        "binary"
        )
        .split("\r\n");

    for (let i = 0; i <= split.length; i++)
        if (split[i].match(/^Content-Length:\ ([0-9]+)$/)) {
            split[i] = split[i].replace(/[0-9]+/, "999999999999");
            break;
        }


    let rawMessageAsBinaryString = split.join("\r\n");

    let onMessage= function(sipPacket){ 

        console.assert(false, "Message should not have been parsed"); 

    };

    let onFlood= function(){

        isSuccess= true;

        console.log("ok test payloadFlood");

        success();

    }

    let streamParser = sip.makeStreamParser(onMessage, onFlood);

    streamParser(rawMessageAsBinaryString);

    for( let i=0; i<100000; i++)
        streamParser("FLOOD");

    console.assert(isSuccess, "Payload Flood attack!");

}


exports.tests= [ handleKeepAlive, flood, payloadFlood ];