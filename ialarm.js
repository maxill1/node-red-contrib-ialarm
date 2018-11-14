module.exports = function(RED) {
      "use strict";

  const iAlarm = require("ialarm");
  const alarmStatus = {
      "ARMED_AWAY": "armAway",
      "ARMED_STAY": "armStay",
      "DISARMED"  : "disarm",
      "CANCEL"    : "cancel",
      "TRIGGERED" : "trigger"
  };

  function newIAlarm(node){
    return new iAlarm(node.serverConfig.host, node.serverConfig.port, node.serverConfig.username, node.serverConfig.password);
  }

  function nodeStatus(node, message){
    node.debug(message);
    node.status({fill:"green",shape:"dot",text: message});
  }

  function handleError(node, e){
    let error = e;
    if(e.message){
      error = e.message;
    }
    let msg = "error " +error;
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

      try {
        const alarm = newIAlarm(node);

        alarm.on("response", function (response) {
          //console.log("Responded: "+response);
        });
        alarm.on("error", function (err) {
          console.log("error: "+err);
        });

        alarm.on("status", function (status) {
          nodeStatus(node, "status:" + status.status)
          //console.log("status: "+JSON.stringify(status));
          node.send({payload: status});
        });

        alarm.getStatus();

      } catch (e) {
        handleError(node, e);
      }
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

    node.on("input", function(msg) {

      try {

        const alarm = newIAlarm(node);

        alarm.on("response", function (response) {
          //console.log("Responded: "+response);
        });
        alarm.on("error", function (err) {
          console.log("error: "+err);
        });

        alarm.on("events", function (events) {
          let lastEvent = "No events";
          if(events.length>0){
            let ev = events[0];
            lastEvent =  "recent events:" + ev.date + " "+ev.message+" (zone "+ev.zone+")";
          }
          nodeStatus(node, lastEvent)
          //console.log("events: "+JSON.stringify(events));
          node.send({payload: events});
        });

        alarm.getEvents();

      } catch (e) {
        handleError(node, e);
      }

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

    node.on("input", function(msg) {

      var commandType = msg.payload;
      var commandName = alarmStatus[commandType];
      if(!commandName){
        handleError(node, "invalid command: "+commandType);
        return;
      }

      const alarm = newIAlarm(node);

      alarm.on("command", function (commandResponse) {
        nodeStatus(node, "status:" + commandResponse.status)
        //console.log("status: "+JSON.stringify(commandResponse));
        node.send({payload: commandResponse});
      });
      alarm.on("response", function (response) {
        //console.log("Responded: "+response);
      });
      alarm.on("error", function (err) {
        console.log("error: "+err);
      });

      alarm[commandName]();
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
