# node-red-contrib-ialarm
A collection of node-red nodes to control iAlarm (https://www.antifurtocasa365.it/) or other chinese 'TCP IP' alarm system like Meian and Emooluxr with https://github.com/maxill1/node-ialarm

<a href="https://www.buymeacoffee.com/maxill1" target="_blank">
<img src="https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg" alt="Buy Me A Coffee"></a>

## Installation
```
npm install node-red-contrib-ialarm
```

##  Nodes
### iAlarm status
outputs a payload with the current status and an array of zone statuses every 5 seconds (configurable)

```
{"zones":[{"id":1,"message":"OK"}],"status":"ARMED_HOME"}
```

### iAlarm events
outputs a payload with the last 24 events recorded in iAlarm host

```
[{"date":"2018-11-11 07:25:04","zone":"70","message":"Sistema Disarmato"}]
```

### iAlarm command
send a command to iAlarm:
- ARMED_AWAY/ARM_AWAY
- ARMED_HOME/ARM_HOME
- DISARMED/DISARM
- CANCEL
