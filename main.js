const { SerialPort } = require('serialport')
const conf = require('./config')
const ch = require('chalk')
const crc = require('crc')
const f = require('./node-fatek/fatek')

console.error(ch.blue.bold('Starting vantage-bridge on %s'), conf.port)

let serialPort = new SerialPort({ path: conf.port, baudRate: 19200, dataBits: 8, parity: 'none' })

let fatek = f.init(conf.plc_protocol, conf.plc_ip, conf.plc_port, conf.plc_station, conf.plc_name)
console.error('Fatek initialized...')

let recbuf = Buffer.alloc(0)

serialPort.on('open', () => {
    console.error('Serial port %s opened.', conf.port)

    serialPort.on('data', function (data) {
        //console.log('Serial got:',data);
        recbuf = Buffer.concat([recbuf, data])
        //console.error('Recbuf(%d):',recbuf.length,recbuf)

        if (sendLoop.wakeUp) {
            if (recbuf.length < 2) return

            recbuf = Buffer.alloc(0)
            const cmd_loop = 'LOOP 1\r\n'
            console.error(ch.yellow('Sending '), cmd_loop)
            serialPort.write(cmd_loop)
            sendLoop.wakeUp = false
            sendLoop.readLoop = true
        } else if (sendLoop.readLoop) {
            if (recbuf.length < 100) return

            parseLoop(recbuf)
            recbuf = Buffer.alloc(0)
        } else {
            console.error(ch.red('Unknown state...'))
        }
    });
})

let sendLoop = {
    wakeUp: false,
    readLoop: false,
    got0A: false,
    got0D: false
}

function askForData() {
    console.error(ch.yellow('Sending wakeup'))
    sendLoop.wakeUp = true
    sendLoop.readLoop = false
    sendLoop.got0A = false
    sendLoop.got0D = false
    serialPort.write('\r')
}

setTimeout(() => {
    askForData()
    setInterval(askForData, 10000)
}, 500)

const ACK = 6

function parseLoop(bfr) {
    //console.error(ch.green('Got LOOP answer(%d):'), recbuf.length, recbuf)

    let ack = recbuf.readUInt8(0)
    if (ack != ACK) return console.error(ch.red('Failed ACK'))

    let ld = recbuf.slice(1) //ld..loop data
    let loo = ld.toString('ascii', 0, 3)
    if (loo != 'LOO') return console.error(ch.red('Failed head LOO'))

    let n = ld.readUInt8(95)
    if (n != 10) return console.error(ch.red('Failed end \\n at LOOP (got %d)'), n)
    let r = ld.readUInt8(96)
    if (r != 13) return console.error(ch.red('Failed end \\r at LOOP (got %d)'), r)

    //TODO: check CRC here
    let temp_inside = ftoc(ld.readInt16LE(9) / 10)
    let humid_inside = ld.readInt8(11)
    let temp_outside = ftoc(ld.readInt16LE(12) / 10)
    let wind_spd = mph2ms(ld.readInt8(14))
    let wind_avg = mph2ms(ld.readInt8(15))
    let humid_outside = ld.readInt8(33)
    let solar_rad = ld.readInt16LE(44)
    let rain_day = ld.readInt16LE(50) * 0.2
    let rain_year = ld.readInt16LE(54) * 0.2

    let sunrise = ld.readInt16LE(91)
    let sunset = ld.readInt16LE(93)

    let loopcrc = ld.readUInt16LE(97)
    let ldshort = ld.slice(0, ld.length - 2)

    //let ycrc1 = crc.crc1(ldshort)
    //console.log('ldshort:',ldshort)
    let ycrc8 = crc.crc8(ldshort)
    let ycrc16 = crc.crc16(ldshort)
    let ycrc24 = crc.crc24(ldshort)
    let ycrc32 = crc.crc32(ldshort)

    console.error(ch.green('LOOP OK'))

    let now = new Date()
    let timespec = now.getHours() * 100 + now.getMinutes()
    console.log('Time:', timespec)
    console.log('T inside:', temp_inside, '°C')
    console.log('T outside:', temp_outside, '°C')

    console.log('Humid inside:', humid_inside, '%')
    console.log('Humid outside:', humid_outside, '%')

    console.log('Wind speed actual:', wind_spd, 'm/s')
    console.log('Wind speed 10min avg:', wind_avg, 'm/s')

    console.log('Solar radiation:', solar_rad, 'W/m2')

    console.log('Day rain:', rain_day, 'mm')
    console.log('Year rain:', rain_year, 'mm')

    console.log('Sunrise:', sunrise)
    console.log('Sunset:', sunset)

        console.log('CRC:',loopcrc.toString(16))
    
    //console.log('CRC1:',ycrc1.toString(16))
    console.log('CRC8:',ycrc8.toString(16))
    console.log('CRC16:',ycrc16.toString(16))
    console.log('CRC24:',ycrc24.toString(16))
    console.log('CRC32:',ycrc32.toString(16))
    console.log('CRC:',crc.toString(16))
    
    let fields = [
        60, //R900 timeout refresh - decrement in PLC   
        timespec,  //R901 actual time
        Math.round(temp_inside * 10), //R902
        Math.round(temp_outside * 10), //R903
        Math.round(humid_inside), //R904
        Math.round(humid_outside), //R905
        Math.round(wind_spd * 10), //R906
        Math.round(wind_avg * 10), //R907
        Math.round(solar_rad), //R908
        Math.round(rain_day * 10), //R909
        Math.round(rain_year * 10), //R910
        sunrise, //R911
        sunset  //R912
    ]

    f.writeContRegs(fatek, 'R900', fields, (err, o) => {
        if (err) console.error(ch.red('Cannot write to Fatek:'), err)
        console.log('Stored to Fatek:', o)
        f.describeSocetState(fatek)
    })
}


function ftoc(fahrenheit) {
    return (fahrenheit - 32) / 1.8
}

function mph2ms(mph) {
    return mph * 0.44704
}