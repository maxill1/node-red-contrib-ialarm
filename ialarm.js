const request = require('request');
const cheerio = require('cheerio');

module.exports = function(RED) {

  const alarmStatus = {
      '1':'ARMED_AWAY',
      '2':'ARMED_STAY',
      '3':'DISARMED',
      '4':'CANCEL',
      '5':'TRIGGERED'
  };

  function decodeStatus(value){
    var st = alarmStatus[value];
    if(!alarmStatus[value]){
        //console.log("Unknown status for "+value);
        throw "unknown status";
    }
    //console.log("Found status :" + st + "("+value+")");
    return st;
  }

  function toValue(st){
    for (var value in alarmStatus) {
      if(alarmStatus[value] === st){
        return value;
      }
    }
    throw "unknown status";
  }

  function decodeZoneMsg(ZoneMsg, i){
    var st = "OK";
    if(ZoneMsg[i-1] & 3){
        st = i + " zone alarm";
    }
    if(ZoneMsg[i-1] & 8){
        st = i + " zone bypass";
    }
    else if(ZoneMsg[i-1] & 16){
        st = i + " zone fault";
    }
    if((ZoneMsg[i-1] & 32)&&((ZoneMsg[i-1] & 8)==0)){
        st = i + " wireless detector low battery";
    }
    if((ZoneMsg[i-1] & 64)&&((ZoneMsg[i-1] & 8)==0)){
        st = i + " wireless detector loss";
    }
    //console.log("Checking msg for zone " + i + ": "+st);
    return st;
  }

  function parseZoneMsg(line){
    var zones = [];
    node.log("Found ZoneMsg "+line);
    var start = line.indexOf('(')+1;
    var end = line.indexOf(')');
    var ZoneMsg = line.substring(start,end);
    ZoneMsg = ZoneMsg.split(",");
    for (var i = 0; i < ZoneMsg.length; i++) {
      var msg = decodeZoneMsg(ZoneMsg, i);
      if(msg){
        //1 based
        zones.push({id: i+1, message: msg});
      }
    }

    return zones;
  }

  function getHeaders(serverConfig){
    return {
      'Authorization': 'Basic ' + Buffer.from(serverConfig.username + ':' + serverConfig.password).toString('base64')
    };
  }

  function get(node, page, callback){
    const serverConfig = node.serverConfig;
    const url = 'http://'+serverConfig.host+':'+serverConfig.port+page;//'/SystemLog.htm';
    node.debug("Retrieving events: "+url);
    var auth = 'Basic ' + Buffer.from(serverConfig.username + ':' + serverConfig.password).toString('base64');
    var options = {
      url: url,
      headers: getHeaders(serverConfig)
    };
    request.get(options, function(err, response, body){
      //console.log(JSON.stringify(response));
      if(response.statusCode!==200 || err){
        console.log('error '+response.statusCode+': '+err);
        console.log(err);
        node.status({fill:"red",shape:"dot",text:"Error: "+response.statusCode + " "+err});
        node.send({payload: "Response error: "+response.statusCode});
        return;
      }
      node.status({fill:"green",shape:"dot",text:"connected"});

      callback(body)
    });
  }

  function post(node, page, formData, callback){
    const serverConfig = node.serverConfig;
    const url = 'http://'+serverConfig.host+':'+serverConfig.port+page;//'/SystemLog.htm';
    node.debug("Retrieving events: "+url);
    var options = {
      url: url,
      headers: getHeaders(serverConfig),
      form: formData
    };
    request.post(options, function(err, response, body){
      //console.log(JSON.stringify(response));
      if(response.statusCode!==200 || err){
        console.log('error '+response.statusCode+': '+err);
        console.log(err);
        node.status({fill:"red",shape:"dot",text:"Error: "+response.statusCode + " "+err});
        node.send({payload: "Response error: "+response.statusCode});
        return;
      }
      node.status({fill:"green",shape:"dot",text:"submitted"});

      callback(body)
    });
  }

  function handleError(node, e){
    var msg = "error " +e.message;
    node.log(msg);
    console.log(e);
    node.status({fill:"red",shape:"ring",text: msg});
  }

  function IalarmStatus(config) {


    var node = this;
    //create node
    RED.nodes.createNode(node, config);
    //check and propagate configurations
    node.serverConfig = RED.nodes.getNode(config.server);
    if (!node.serverConfig) {
      handleError(node, "invalid config");
      return;
    }

    function fetchStatus() {

      get(node, '/RemoteCtr.htm' , function(body){
        try {
          const $ = cheerio.load(body)

          var tag = $('option[selected=selected]');
          var value = tag.attr('value');

          var data = {};
          data.zones = [];
          //alarm status
          data.status = decodeStatus(value);
          node.status({fill:"green",shape:"dot",text:"last status: "+data.status});

          //zones and messages
          var scriptLines = $('script').html().split('\n');
          node.debug("scriptLines "+scriptLines);
          for (var l = 0; l < scriptLines.length; l++) {
            var line = scriptLines[l];
            //var ZoneMsg = new Array(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            if(line.indexOf("var ZoneMsg")>-1){
              //node.log("Found ZoneMsg "+line);
              var start = line.indexOf('(')+1;
              var end = line.indexOf(')');
              var ZoneMsg = line.substring(start,end);
              ZoneMsg = ZoneMsg.split(",");
              for (var i = 0; i < ZoneMsg.length; i++) {
                var msg = decodeZoneMsg(ZoneMsg, i);
                if(msg){
                  //1 based
                  data.zones.push({id: i+1, message: msg});
                }
              }
              break;
            }
          }

          //node.log("iAlarm status "+data.status);
          node.send({payload: data});
        } catch (e) {
          handleError(node, e);
        }
      });
    }
    node.log("checking iAlarm every "+config.refresh +" milliseconds");
    setInterval(fetchStatus, config.refresh);
  }
  RED.nodes.registerType("ialarm status", IalarmStatus);

  function IalarmEvents(config) {


    var node = this;
    //create node
    RED.nodes.createNode(node, config);
    //check and propagate configurations
    node.serverConfig = RED.nodes.getNode(config.server);
    if (!node.serverConfig) {
      handleError(node, "invalid config");
      return;
    }

    node.on('input', function(msg) {

      get(node, '/SystemLog.htm' , function(body){
        try {
          const $ = cheerio.load(body)
          var events = [];
          $('tr').each(function(i, elem) {
            var ev = $(this).html();

            var child$ = cheerio.load(this);
            let td = child$('td').map(function () {
              return child$(this).text().trim();
            }).get();

            if(td[0] && td[1] && td[2]){
              var event = {date: td[0], zone: td[1], message: td[2]};
              events.push(event);
            }
          });
          node.send({payload: events});

        } catch (e) {
          handleError(node, e);
        }
      });
    });
  }
  RED.nodes.registerType("ialarm events", IalarmEvents);

  function IalarmSet(config) {

    var node = this;
    //create node
    RED.nodes.createNode(node, config);
    //check and propagate configurations
    node.serverConfig = RED.nodes.getNode(config.server);
    if (!node.serverConfig) {
      handleError(node, "invalid config");
      return;
    }

    node.on('input', function(msg) {

      var commandType = msg.payload;
      var value = toValue(commandType);
      var formData = {'Ctrl': value, 'BypassNum': '00', 'BypassOpt': '0'}

      node.log("Sending " +JSON.stringify(formData));


      post(node, '/RemoteCtr.htm', formData, function(body){
        try {
          const $ = cheerio.load(body)
          var events = [];
          $('tr').each(function(i, elem) {
            var ev = $(this).html();

            var child$ = cheerio.load(this);
            let td = child$('td').map(function () {
              return child$(this).text().trim();
            }).get();

            if(td[0] && td[1] && td[2]){
              var event = {date: td[0], zone: td[1], message: td[2]};
              events.push(event);
            }
          });
          node.send({payload: events});

        } catch (e) {
          handleError(node, e);
        }
      });

    });
  }
  RED.nodes.registerType("ialarm set", IalarmSet);

  function IalarmServerNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    node.log(config.singleMessage);

    this.host = config.host;
    this.port = config.port;
    this.username = config.username;
    this.password = config.password;

    if (!node.host || !node.port || !node.username || !node.password) {
      return;
    }

    node.on("close", function() {
      //TODO
    });
  }
  RED.nodes.registerType("ialarm-server", IalarmServerNode);
}
