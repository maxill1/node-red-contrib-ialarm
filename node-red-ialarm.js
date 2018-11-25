module.exports = function(RED) {
      "use strict";

  const iAlarm = require("ialarm");
  const alarmStatus = {
      "ARMED_AWAY": "armAway",
      "ARM_AWAY"  : "armAway",
      "ARMED_HOME": "armHome",
      "ARM_HOME"  : "armHome",
      "DISARMED"  : "disarm",
      "DISARM"    : "disarm",
      "CANCEL"    : "cancel",
      "TRIGGERED" : "trigger"
  };

  function newIAlarm(node){
    //node.log("Creating iAlarm instance");
    return new iAlarm(node.serverConfig.host, node.serverConfig.port,
                      node.serverConfig.username, node.serverConfig.password,
                      node.serverConfig.zones);
  }

  function nodeStatus(node, message, color){
    node.debug(message);
    if(!color){
      color = "green";
    }
    node.status({fill:color,shape:"dot",text: message});
  }

  function handleError(node, e){
    let error = e;
    if(e.message){
      error = e.message;
    }
    let msg = "error " +error;
    node.log(msg);
    node.log(e);
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

    node.on("input", function(msg) {
        nodeStatus(node, "idle", "blue");
        var globalContext = this.context().global;

        try {
          const alarm = newIAlarm(node);

          alarm.on("response", function (response) {
            //node.log("Responded: "+response);
          });
          alarm.on("error", function (err) {
            node.log("error: "+err);
            node.send({error: err});
          });

          alarm.on("status", function (status) {
            nodeStatus(node, "status:" + status.status);
            //node.log("status: "+JSON.stringify(status));

            //add zone names
            if(status.zones){
              for (var i = 0; i < status.zones.length; i++) {
                var zone = status.zones[i];
                zone.name = node.serverConfig.getCachedName(zone.id);
              }
            }
            //output
            node.send({payload: status});
          });

      	if(config.waitnames && (!globalContext.zonesCache || globalContext.zonesCache.caching)){
            nodeStatus(node, "loading "+node.serverConfig.zones+" zones cache..." , "yellow");
          }else{
            nodeStatus(node, "querying", "blue");
            alarm.getStatus();
          }

        } catch (e) {
          handleError(node, e);
        }
    });
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
          //node.log("Responded: "+response);
        });
        alarm.on("error", function (err) {
          node.log("error: "+err);
          node.send({error: err});
        });

        alarm.on("events", function (events) {
          let lastEvent = "No events";
          if(events.length>0){

            for (var i = 0; i < events.length; i++) {
              events[i].name = node.serverConfig.getCachedName(events[i].zone);
            }

            let ev = events[0];
            var description = ev.zone;
            if(ev.name){
              description = description+ " "+ ev.name;
            }
            lastEvent =  "recent events:" + ev.date + " "+ev.message+" (zone "+description +")";
          }
          nodeStatus(node, lastEvent);
          //node.log("events: "+JSON.stringify(events));
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
        nodeStatus(node, "status:" + commandResponse.status);
        //node.log("status: "+JSON.stringify(commandResponse));
        node.send({payload: commandResponse});
      });
      alarm.on("response", function (response) {
        //node.log("Responded: "+response);
      });
      alarm.on("error", function (err) {
        node.log("error: "+err);
        handleError(node, err);
        node.send({error: err});
      });

      alarm[commandName]();
    });
  }
  RED.nodes.registerType("ialarm command", IalarmSet);

  function IalarmServerNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);

    var globalContext = this.context().global;

    this.host = config.host;
    this.port = config.port;
    this.username = config.username;
    this.password = config.password;
    this.zones = config.zones;

    if (!node.host || !node.port || !node.username || !node.password) {
      return;
    }

    var stub = {serverConfig : node};
    const alarm = newIAlarm(stub);
    alarm.on('allZones', function (zones) {
      var info = "got "+Object.keys(zones).length+" zones info";
      nodeStatus(node, info);
      globalContext.zonesCache.zones = zones;
      globalContext.zonesCache.caching = false;
    });

    alarm.on('zoneInfo', function (zoneInfo) {
      node.log("zoneInfo: "+JSON.stringify(zoneInfo));
    });

    if(!globalContext.zonesCache){
      globalContext.zonesCache = {};
    }
    if(!globalContext.zonesCache.zones  && !globalContext.zonesCache.caching){
        globalContext.zonesCache.zones = {};
        globalContext.zonesCache.caching = true;
        alarm.getAllZones();
    }
    this.getCachedName = function(id){
      if(globalContext.zonesCache &&
        globalContext.zonesCache.zones &&
        globalContext.zonesCache.zones[id]){
        return globalContext.zonesCache.zones[id].name;
      }
      return undefined;
    };

    node.on("close", function() {
      node.log("Reset zones cache");
      globalContext.zonesCache = undefined;
    });
  }
  RED.nodes.registerType("ialarm-server", IalarmServerNode);
};
