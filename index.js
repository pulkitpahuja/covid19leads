var Twit = require('twit')
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
var nodemailer = require('nodemailer');
var handlebars = require('handlebars');
var fs = require('fs');
const request = require('postman-request');
const moment = require('moment');
var cron = require('node-cron');

const NodeRSA = require('node-rsa');
const key = new NodeRSA({ b: 512 });
key.importKey(process.env.rsa_public, 'pkcs8-public-pem');
key.importKey(process.env.rsa_private, 'pkcs1-pem');
//Imports Above
const app = express();
const port = process.env.PORT || 5000;
process.env.TZ = 'Asia/Kolkata';
const uri = "mongodb+srv://pulkitpahuja:iamokayru@mkrismongocluster.nyabn.mongodb.net/";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
var globdb = null;
client.connect((err, db) => {
    globdb = db.db("mkrisCloud");
})
app.use(express.static(path.join(__dirname, '/build')))


var alert_transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.mail,
        pass: process.env.pass
    }
});
const readHTMLFile = (path, callback) => {
    fs.readFile(path, { encoding: 'utf-8' }, (err, html) => {
        if (err) {
            callback(err);
        }
        else {
            callback(null, html);
        }
    });
};

var T = new Twit({
    consumer_key: process.env.consumer_key,
    consumer_secret: process.env.consumer_secret,
    access_token: process.env.access_token,
    access_token_secret: process.env.access_token_secret,
    timeout_ms: 60 * 1000,  // optional HTTP request timeout to apply to all requests.
    strictSSL: true,     // optional - requires SSL certificates to be valid.
})

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const search_params = {
    "Beds": ["bed", "beds"],
    "ICU": ["icu"],
    "Oxygen": ["oxygen"],
    "Ventilator": ["ventilator", "ventilators"],
    "Tests": ["test", "tests"],
    "Fabiflu": ["fabiflu"],
    "Remdesivir": ["remdesivir", "remdesivirs"],
    "Favipiravir": ["favipiravir", "favipiravirs"],
    "Plasma": ["plasma"],
    "Food": ["food", "tiffin"],
    "Ambulance": ["ambulance"],
    "Tocilizumab": ["tocilizumab"],
    "18-45": 18,
    "45+": 45
}

app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, '/build/index.html'))
})

app.post('/tweets', (req, res) => {

    let { state, requirements } = req.body;
    if (state == null || state.length === 0 || requirements.length === 0) {
        return res.send([])
    }
    let final = [];
    requirements.map(e => {
        final = final.concat(search_params[e])
    })
    if (state[0].customOption) {
        state[0] = state[0].label
    }
    const q = { count: 60, q: `verified ${state[0].toLowerCase()} (${final.join(' OR ')}) -'not verified' -'arrange' -'unverified' -'needed' -'need' -'needs' -'required' -'require' -'want' -'wanted' -'requires' -'request' -'requirement' -'requirements' -filter:links -filter:retweets`, tweet_mode: 'extended' }
    T.get('search/tweets', q, function (err, data, response) {
        const splittedArray = [];
        while (data.statuses.length > 0) {
            splittedArray.push(data.statuses.splice(0, 3));
        }

        res.send(splittedArray)
    })
});

var options = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
}

const createData = (data, ageGroup) => {
    //1.Filter according to agegroup
    //2. If available_capacity>0 add to list for table
    let final = [];
    if (data == null) {
        return []
    }
    for (var centre of data) {
        var centreObj = {
            "centre": centre["name"] + ", " + centre["address"] + ", " + centre["state_name"]
            , "sessions": null
        };
        var sessList = [];
        for (var session of centre["sessions"]) {
            if (session["min_age_limit"] == search_params[ageGroup] && session["available_capacity"] > 0) {
                sessList.push(session)
            }
        }
        if (sessList.length !== 0) {
            centreObj["sessions"] = sessList;
            final.push(centreObj)
        }
    }
    return final
}

const createHTMLtag = (data, headers) => {
    headers.shift();
    let finalTag = "";
    for (let x of data) {
        let tag = "<tr>"
        tag = tag + "<td style='border: 1px solid #000;text-align:center'>" + x["centre"] + "</td>"
        var list = headers.map(header => {
            var temp = "";
            for (let sess of x["sessions"]) {
                if (header == sess["date"]) {
                    temp = "<b>Avl. Vaccines: </b>" + sess["available_capacity"] + "\n <b>" +
                        sess["vaccine"] + "</b> \n" +
                        sess["slots"].join(",")
                    break;
                }
            }
            if (temp != "") {
                return temp
            } else {
                return "-"
            }
        }).map(e => {
            return "<td style='border: 1px solid #000;text-align:center'>" + e + "</td>"
        }).join('')
        tag += list;
        tag += "</tr>"
        finalTag += tag;
    }
    return finalTag
}

const sendEmail = (data, email, pinCode, ageGroup) => {
    return new Promise((resolve, reject) => {
        const today = moment().subtract(1, 'd');
        const res = Array(7).fill().map(
            () => today.add(1, 'd').format('DD-MM-yyyy')
        );
        const encrypt = {
            "status": true
        };
        const encrypted = key.encrypt(JSON.stringify(encrypt), 'base64');
        const uri = `https://covid19leads.herokuapp.com/unsubscribe/${email}/${encodeURIComponent(encrypted)}`;
        readHTMLFile(__dirname + '/email_end.html', (err, html) => {
            var template = handlebars.compile(html);
            var replacements = {
                pinCode: pinCode,
                ageGroup: ageGroup,
                email: email,
                link: uri,
                headers: ["Centres"].concat(res),
                table: createHTMLtag(data, ["Centres"].concat(res))
            };
            var htmlToSend = template(replacements);
            var mailOptions = {
                from: '"Covid19Leads" <covid19leads@gmail.com>',
                to: email,
                subject: 'Notification From Covid19Leads',
                html: htmlToSend,
            };
            alert_transporter.sendMail(mailOptions, (error, response) => {
                if (error) {
                    console.log(error);
                    resolve('error')
                }
                resolve("200")
            });
        });
    })

}

cron.schedule('0 0 */1 * * *', () => {
    globdb.collection("mailing_list").find({}).toArray((err, result) => {
        if (err) consolse.log(err)
        for (var user of result) {
            const { pinCode, ageGroup, email } = user;
            request.get(`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${pinCode}&date=${moment().format("DD-MM-yyyy")}`
                , options, function (error, response, body) {
                    console.log(body)
                    const data = createData(JSON.parse(body)["centers"], ageGroup[0])
                    if (data.length > 0) {
                        sendEmail(data, email, pinCode, ageGroup).then(stat => {

                        })
                    }
                });
        }
    });
});

app.post('/vaccinated', (req, res) => {
    const { type, data } = req.body;
    const { pinCode, ageGroup, email } = data;
    if (type == null) {
        return res.send('Restricted Access')
    }
    if (type == "now") {
        request.get(`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${pinCode}&date=${moment().format("DD-MM-yyyy")}`
            , options, function (error, response, body) {
                console.log(body, response)
                const data = createData(JSON.parse(body)["centers"], ageGroup)
                if (data.length > 0) {
                    sendEmail(data, email, pinCode, ageGroup).then(stat => {
                        if (stat == 200) {
                            res.send("200")
                        } else {
                            res.send("error")
                        }
                    })
                } else {
                    res.send("500")
                }

            });
    } else {
        //enter user to mongo list
        globdb.collection("mailing_list").findOne({ email: email }, function (err, result) {
            if (err) {
                res.send("error")
            } else {
                if (result) {
                    res.send("700")
                } else {
                    globdb.collection("mailing_list").insertOne(data, async (err, result) => {
                        if (err) {
                            res.send("error");
                        } else {
                            res.send("200")
                        }
                    });
                }
            }
        });

    }
})

app.post('/unsubscribe', (req, res) => {
    ``
    const { email, token } = req.body;
    if (token == null) {
        return res.redirect('/')
    }
    try {
        const decryptedString = key.decrypt(decodeURIComponent(token), 'utf8');
        const decrypedObject = JSON.parse(decryptedString);
        if (decrypedObject["status"]) {
            globdb.collection("mailing_list").deleteMany({ email: email }, function (err, obj) {
                if (err) throw err
            });
        } else {
            res.redirect('/')
        }
    } catch (error) {
        res.redirect("/")
    }

})

app.listen(port, () => console.log(`Listening on port ${port}`))
