var http = require('http');
var pg = require('pg');
var nodemailer = require('nodemailer');
var interval = 1200000; //20 min

var client  = "";
var client2 = "";

var express = require('express');
var app = express.createServer(express.logger());

app.get('/', function(request, response) {
  response.send('Welcome to Pinger!!');
});

var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on " + port);
});

switch(process.env.NODE_ENV){
  case 'development':
    var keys = require('./keys.js');
    client  = new pg.Client(keys.dbConnectionString);
    client2 = new pg.Client(keys.dbConnectionString);
    break;
  case 'production':
    client = new pg.Client(process.env.DATABASE_URL);
    client2 = new pg.Client(process.env.DATABASE_URL);
    break;
}

client.connect();
client2.connect();

var options = {
  host: '',
  port: 80,
  path: '/',
  agent: false,
  method: 'HEAD'
};

//reset state of all domains at the first time
var init = function(){
  var query = client.query({ text: "update domains set state = true where state = false"});
}

var transport = nodemailer.createTransport("SMTP", {
    service: 'Gmail',
    auth: {
        user: "yourSMTPUsername" ,
        pass: "yourSMTPPassword"
    }
});

var sendMail = function(rec, dom, msg ){
  message.to = rec;
  message.subject = "Server under the Domain " + dom;
  message.text = msg;

  transport.sendMail(message, function(error){
    if(error){
        console.log('Error occured');
        console.log(error.message);
        return;
    }
    console.log('Message sent successfully!');
  });

  message.to = '';
  message.subject = '';
  message.text = '';
}

// Message object
var message = {
    from: 'Pinger Service',
    // Comma separated list of recipients
    to: '',
    subject: '', //
    headers: {
        'X-Laziness-level': 1000
    },
    text: '',
};

function sendNotifications(domain, domain_id, msg){
  var query2 = client2.query({
    text: "select * from subscribers where domain_id = $1",
    values: [domain_id]
  });
  query2.on('row', function(result){
    sendMail(result.email, domain, msg);
  });
}

var checkDomain = function(domain, domain_id, callback){
  options.host = domain;
  var req = http.request(options, function(res){
    //check if statusCode is not valid
    if(res.statusCode != 200 && res.statusCode != 301 && res.statusCode != 302 && res.statusCode != 303 && res.statusCode != 304){
      callback(0);
    }
    else{
      callback(1);
    }
  });

  req.on('socket', function(socket){
    socket.setTimeout(10000);
    socket.on('timeout', function(){
      req.abort();
    });
  });

  req.on('error', function(e) {
    callback(0);
    console.log("Got error: " + e.message);
  });
  req.end();
};

var pong = function(){
  var query = client.query({ text: "select * from domains where state = false"});
  query.on('row', function(row){
    checkDomain(row.name, row.id, function(result) {
      if (result === 1){
        client2.query({
          text: "update domains set state = true where id = $1",
          values: [row.id]
        });
        var msg = "Hello, you receive this email from the web-ping service. \nYour Server with the Domain: "+ row.name +" can be reached by our Service again. \n";
        sendNotifications(row.name, row.id, msg);
        console.log("pong");
      }
    });
  });
  setTimeout(pong, interval);
}

var ping = function(){
  var query = client.query({ text: "select * from domains where state = true"});
  query.on('row', function(row){
    checkDomain(row.name, row.id, function(result) {
      if (result === 0){
        client2.query({
          text: "update domains set state = false where id = $1",
          values: [row.id]
        });
        var msg = "Testmail Hello, you receive this email from the web-ping service. \nYour Server with the Domain: "+ row.name +" can\'t be reached from our Service. \nPlease check your server state manually and inform the responsible person.";
        sendNotifications(row.name, row.id, msg);
        console.log("ping");
      }
    });
  });
    setTimeout(ping, interval);
}

init();
ping();
pong();
