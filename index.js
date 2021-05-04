var Twit = require('twit')
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 5000;
process.env.TZ = 'Asia/Kolkata';
const path = require('path');

app.use(express.static(path.join(__dirname, '/build')))

var T = new Twit({
    consumer_key: 'GoFNDh2F5rOwwRmryfEIuyj7r',
    consumer_secret: 'rWos7P7uLU1TzqiXOZjYQQLvNTCqVL6Q4qjIxcJios4Kkl8J8s',
    access_token: '834362369514024964-aMV8N68i0cZNfINmU5gJFzL6JucTVjq',
    access_token_secret: 'OD34QmR1rZkcs7460rjLzCb4e6tePAxWb7Y0AvHjvt2bD',
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
    "Tocilizumab": ["tocilizumab"]
}

app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, '/build/index.html'))
})

app.post('/tweets', (req, res) => {
    const { state, requirements } = req.body;
    if (state == null || state.length === 0 || requirements.length === 0) {
        return res.send([])
    }
    let final = [];
    requirements.map(e => {
        final = final.concat(search_params[e])
    })
    const q = { count: 60, q: `verified ${state[0].toLowerCase()} (${final.join(' OR ')}) -'not verified' -'arrange' -'unverified' -'needed' -'need' -'needs' -'required' -'require' -'want' -'wanted' -'requires' -'request' -'requirement' -'requirements'`, tweet_mode: 'extended' }
    T.get('search/tweets', q, function (err, data, response) {
        const splittedArray = [];
        while (data.statuses.length > 0) {
            splittedArray.push(data.statuses.splice(0, 3));
        }

        res.send(splittedArray)
    })
});


app.listen(port, () => console.log(`Listening on port ${port}`))
