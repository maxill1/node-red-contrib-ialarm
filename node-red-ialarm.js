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

        try {
          const alarm = newIAlarm(node);

          alarm.on("response", function (response) {
            //node.log("Responded: "+response);
          });
          alarm.on("error", function (err) {
            node.log("error: "+err);
            handleError(node, err);
            node.send({error: err});
          });

          alarm.on("status", function (status) {
            nodeStatus(node, "status:" + status.status);
            //node.log("status: "+JSON.stringify(status));

            //add zone names
            if(status.zones){
              for (var i = 0; i < status.zones.length; i++) {
                var zone = status.zones[i];
                var zoneCache = node.serverConfig.getZoneCache(zone.id);
                if(zoneCache){
                  zone.name = zoneCache.name;
                  zone.type = zoneCache.type;
                }
              }
            }
            //output
            node.send({payload: status});
          });

      	if(config.waitnames && (!node.serverConfig.zonesCache || node.serverConfig.zonesCache.caching)){
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
          handleError(node, err);
          node.send({error: err});
        });

        alarm.on("events", function (events) {
          let lastEvent = "No events";
          if(events.length>0){

            for (var i = 0; i < events.length; i++) {
              var zoneCache = node.serverConfig.getZoneCache(events[i].zone);
              if(zoneCache){
                events[i].name = zoneCache.name;
                events[i].type = zoneCache.type;
              }
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
      node.zonesCache.zones = zones;
      node.zonesCache.caching = false;
    });

    alarm.on('zoneInfo', function (zoneInfo) {
      node.log("zoneInfo: "+JSON.stringify(zoneInfo));
    });

    alarm.on('error', function (error) {
      node.log("error connecting to : "+node.host + ":"+node.port +" - "+error);
    });

    if(!node.zonesCache){
      node.zonesCache = {};
    }
    if(!node.zonesCache.zones  && !node.zonesCache.caching){
        node.zonesCache.zones = {};
        node.zonesCache.caching = true;
        alarm.getAllZones();
    }
    this.getZoneCache = function(id){
      if(node.zonesCache &&
        node.zonesCache.zones &&
        node.zonesCache.zones[id]){
        return node.zonesCache.zones[id];
      }
      return undefined;
    };

    node.on("close", function() {
      node.log("Reset zones cache");
      node.zonesCache = undefined;
    });
  }
  RED.nodes.registerType("ialarm-server", IalarmServerNode);
};
