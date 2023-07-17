var dgram = require('dgram'),
	util = require('util');

exports.mn = mn = function (module) {
    return module.ip+":"+module.port+":"+module.station;
}

exports.init = function(ip, port, station, callback) {
    var sock = dgram.createSocket('udp4');	
    var mod = {
	ip: ip, 
	port: port, 
	station: station, 
	sock: sock,
	fifo_req: [],
	module_free: true
    };	
    
    /*
    sock.on('message',function(msg){
	console.log('Received from Fatek %s:%s',mn(mod),msg.toString());
    });
    */
    sock.on('message',function(msg) {
	sock_got_message(msg,mod);
    });
    callback(false,mod);		
}


exports.close = function(module) {
    //console.log("Closing connection to module %s",mn(module));
    module.sock.close();	
}

exports.readState = function(module, callback) {
    var bfr = makeHead(module.station,0x40,null);
    //console.log("Sending read status request %j to %s",bfr, mn(module) );
    sendRequest(module,bfr,function(err,msg) {
	if(err) return callback(err);
	//console.log('Read state:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		var o = {
		    error_code: char2num(msg[5]),
		    status1: jbs(msg[6],msg[7]),
		    status2: jbs(msg[8],msg[9]),
		    status3: jbs(msg[10],msg[11]),
		};
		callback(false,o);
	    }
	});
    });

}

//Mixed read
exports.read = function(module, regs, callback) {
    var n = regs.length;
    //console.log("Mixed reading %d Fatek(%j) registers: %j",n,mn(module),regs);	
    var payload = [hbc(n),lbc(n),];
    var mem = [];
    regs.forEach(function(reg){
	var mem1 = {};
	payload = payload.concat(normalizeRegister(reg,mem1));
	mem.push(mem1);
    });	
    //console.log('Mem:',mem);
    var bfr = makeHead(module.station,0x48,payload);
    //console.log("Sending mixed read request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {	
	if(err) return callback(err);
	//console.log('Mixed read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		
		var i = 6,resp = {};
		mem.forEach(function(m) {					
		    var part = msg.slice(i,i+m.len_resp);
		    i += m.len_resp;					
		    resp[m.reg] = signum(parseInt(part.toString(),16),m.max);
		});
		var o = {
		    error_code: char2num(msg[5]),
		    r:resp,
		};
		callback(false,o);
	    }
	});
    });
}

//Mixed write
exports.write = function(module, data, callback) {
    var n = data.length;
    
    console.log("Mixed writing %d Fatek(%j) registers: %j",n,mn(module),data);	
    var payload = [hbc(n),lbc(n),];	
    data.forEach(function(d){
	var reg = d[0];
	var val = d[1];
	var mem1 = {};		
	payload = payload.concat(normalizeRegister(reg,mem1));
	payload = payload.concat(normalizeValue(val,mem1));
    });	
    var bfr = makeHead(module.station,0x49,payload);
    console.log("Sending mixed write request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {	
	if(err) return callback(err);
	//console.log('Mixed read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);			
		var o = {
		    error_code: char2num(msg[5]),
		};
		callback(false,o);
	    }
	});
    });
}

exports.readContReg = function(module, n,reg, callback) {
    //console.log("Reading %d Fatek(%j) registers following: %s",n,mn(module),reg);	
    var payload = [hbc(n),lbc(n),];
    var mem = {};
    payload = payload.concat(normalizeRegister(reg,mem));
    var bfr = makeHead(module.station,0x46,payload);
    //console.log("Sending read reg request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {	
	if(err) return callback(err);
	//console.log('Read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		var o = {
		    error_code: char2num(msg[5]),
		    r:[],
		};
		for(var i=6;i<(msg.length-4);i+=mem.len_resp) {
		    var part = msg.slice(i,i+mem.len_resp);
		    var val = signum((parseInt(part.toString(),16)),mem.max);					
		    o.r = o.r.concat(val);
		}
		callback(false,o);
	    }
	});
    });
}

function signum(inp,max) {
    if(inp>=max) return inp-2*max;
    return inp;
}
function invsignum(inp,max) {
    if(inp<0) return inp+2*max;
    return inp;
}

exports.readContDisc = function(module, n,reg, callback) {
    //console.log("Reading %d Fatek(%j) registers following: %s",n,mn(module),reg);	
    var payload = [hbc(n),lbc(n),];
    payload = payload.concat(normalizeRegister(reg));
    var bfr = makeHead(module.station,0x44,payload);
    console.log("Sending read disc request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {	
	if(err) return callback(err);
	console.log('Read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		var o = {
		    error_code: char2num(msg[5]),
		    r:[],
		};
		for(var i=6;i<(msg.length-3);i+=1) {
		    var part = msg.slice(i,i+1);
		    var val = (parseInt(part.toString(),16));
		    o.r = o.r.concat(val);
		}
		callback(false,o);
	    }
	});
    });
}


exports.writeContDisc = function(module, reg, data, callback) {
    var n = data.length;
    console.log("Write %d Fatek(%j) registers following: %s",n,mn(module),reg);	
    var payload = [hbc(n),lbc(n),];
    payload = payload.concat(normalizeRegister(reg));
    data.forEach(function(el){
	    payload = payload.concat(toCodes(el));
    });
    
    var bfr = makeHead(module.station,0x45,payload);
    console.log("Sending write discrete request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {
	if(err) return callback(err);
	//console.log('Read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		var o = {
		    error_code: char2num(msg[5]),
		    r:[],
		};
		for(var i=6;i<(msg.length-3);i+=1) {
		    var part = msg.slice(i,i+1);
		    var val = (parseInt(part.toString(),16));
		    o.r = o.r.concat(val);
		}
		callback(false,o);
	    }
	});	
    });	
}

exports.writeContRegs = function(module, reg, data, callback) {
    var n = data.length;
    console.log("Write %d Fatek(%j) registers following: %s",n,mn(module),reg);	
    var payload = [hbc(n),lbc(n),];
    let mem1 = {}
    payload = payload.concat(normalizeRegister(reg,mem1))
    data.forEach(function(el){
	    payload = payload.concat(normalizeValue(el,mem1))
    });
    
    var bfr = makeHead(module.station,0x47,payload);
    console.log("Sending write registers request %s to %s",bfr.toString(), mn(module) );
    sendRequest(module,bfr,function(err,msg) {
	if(err) return callback(err);
	//console.log('Read data:Got msg:%s',msg.toString());
	checkPacket(msg,function(res) {
	    if(!res) {
		console.log('Got bad packet:%s',msg.toString());
		callback(new Error('Got bad packet ('+msg.toString()+')'),null);
	    } else {
		//console.log('Packet check OK:%s',res);
		var o = {
		    error_code: char2num(msg[5]),
		    r:[],
		};
		for(var i=6;i<(msg.length-3);i+=1) {
		    var part = msg.slice(i,i+1);
		    var val = (parseInt(part.toString(),16));
		    o.r = o.r.concat(val);
		}
		callback(false,o);
	    }
	});	
    });	
}


function sendRequest(module,bfr,callback) {
    module.fifo_req.push({
	bfr: bfr,
	ip: module.ip,
	port: module.port,
	sock: module.sock,
	callback: callback
    });
    sendReqNow(module);
}

function sendReqNow(module) {
    if(!module.module_free) return;
    //console.log(module);
    if(module.fifo_req.length<1) return;
    
    module.module_free = false;
    var o = module.fifo_req.shift();	
    o.sock.send(o.bfr,0,o.bfr.length,o.port,o.ip);
    o.timeout = setTimeout(function() {
	//console.log('Requested timeouted!!!');
	module.actual_request.callback(new Error('Request timeout!'));
	module.actual_request = false;
	module.module_free = true;
	sendReqNow(module);	
    },1000);
    //console.log('Request sent...');
    module.actual_request = o;
}

function sock_got_message(msg,module) {
    if(!module.actual_request) {
	console.log('Unsolicted response:',msg);
	//return;
    }
    var clbk = module.actual_request.callback;
    clearTimeout(module.actual_request.timeout);
    
    //console.log(module.actual_request);
    module.actual_request = false;	
    if(typeof(clbk)!='undefined') clbk(false,msg);

    module.module_free = true;
    sendReqNow(module);
}

function makeHead(station,command,data) {
    var bfr = [
	    0x02, 		//STX
	    hbc(station),lbc(station), 	//Station no.
	    hbc(command),lbc(command), 	//Command code
	    ];
    if(data) bfr = bfr.concat(data);
    //Calculate checksum
    var c = 0;
    for(var i=0;i<bfr.length;i++)
	c += bfr[i]; 
    bfr = bfr.concat([hbc(c),lbc(c),0x03]);
    return new Buffer(bfr);
}

function checkPacket(pack,callback) {
    var res = (pack.length>=9) 
	&& (pack[0]===0x02)
	&& (pack[pack.length-1]===0x03);
    //TODO: Add another checks (station no, command code, CRC, ...)
    callback(res);
}

function hbc(num) {
    return num2char((num&0xF0)>>4);
}

function lbc(num) {
    return num2char(num&0x0F);
}

function num2char(num) {
    if(num>=0 && num <=9) return 0x30+num;	
    if(num>=10&& num<=15) return 0x41+num-10;
    throw new Error("Bad range("+num+")");
}

function char2num(chr) {
    if(chr>=0x30 && chr <= 0x39) return chr-0x30;
    if(chr>=0x41 && chr <= 0x46) return chr-0x41+10;
    if(chr>=0x61 && chr <= 0x66) return chr-0x61+10;		
    throw new Error("Bad range("+chr+")");
}

function jbs(hb,lb) {
    return (char2num(hb)<<4) + char2num(lb);
}

function normalizeRegister(reg,mem) {
    if(typeof(mem)=='undefined') mem = [];
    reg = reg.toUpperCase();
    var type,idx,n,m,max=0;
    if(reg.indexOf('DR')===0) {
	type = 'DR';idx = parseInt(reg.substr(2),10);n=5;m=8;max=2147483648;
    } else if(reg.indexOf('DD')===0) {
	type = 'DD';idx = parseInt(reg.substr(2),10);n=5;m=8;max=2147483648; 
    } else if(reg.indexOf('RT')===0) {
	type = 'RT';idx = parseInt(reg.substr(2),10);n=4;m=4;max=32768; 
    } else if(reg.indexOf('RC')===0) {
	type = 'RC';idx = parseInt(reg.substr(2),10);n=4;m=4;max=32768; 
    } else if(reg.indexOf('R')===0) {
	type = 'R';idx = parseInt(reg.substr(1),10);n=5;m=4;max=32768; 
    } else if(reg.indexOf('D')===0) {
	type = 'D';idx = parseInt(reg.substr(1),10);n=5;m=4;max=32768; 
    } else if(reg.indexOf('M')===0) {	
	type = 'M';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else if(reg.indexOf('X')===0) {	
	type = 'X';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else if(reg.indexOf('Y')===0) {	
	type = 'Y';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else if(reg.indexOf('S')===0) {	
	type = 'S';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else if(reg.indexOf('T')===0) {	
	type = 'T';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else if(reg.indexOf('C')===0) {	
	type = 'C';idx = parseInt(reg.substr(1),10);n=4;m=1;	
    } else {
	throw new Error("Bad Fatek register "+reg);				
    }
    mem.reg = reg;
    mem.len_reg = n;
    mem.len_resp = m;
    mem.max = max;
    //console.log("Parsed %s%d",type,idx);
    var tmp = type+("0000000000"+idx).substr(-n);
    //console.log(tmp);
    return toCodes(tmp);
}

function normalizeValue(val, mem) {
    //var v = (util.format("0000000000%s",val.toString(16))).substr(-mem.len_resp);
    var val2 = invsignum(val,mem.max);
    var v = ("0000000000"+val2.toString(16)).substr(-mem.len_resp);
    return toCodes(v);
    
}

function toCodes(str) {
    str = str.toString().toUpperCase();
    var bfr = [];
    for(var i = 0;i<str.length;i++) 
	bfr.push(str.charCodeAt(i));
    return bfr;		
}