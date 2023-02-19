
const express = require('express');
const app = express();

require('dotenv').config()

const session = require("express-session")

const bodyParser = require("body-parser");
const passport = require("passport");
const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const LocalStrategy = require('passport-local').Strategy

app.use(bodyParser.json());

app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: "habibi"
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGO_CONNECT_URL)

const userSchema = new mongoose.Schema({
    name: String,
    username: String,
    password: String,
    role: String,
    phone: String,
    adress: String,
    points: Number
});

userSchema.plugin(passportLocalMongoose)

const User = new mongoose.model("User", userSchema);

const orderSchema = new mongoose.Schema({
    userId: String,
    adress: String,
    phone: String,
    pointsRecived: Number,
    completed: Boolean
})

const Order = new mongoose.model("Order", orderSchema);

const voucherSchema = new mongoose.Schema({
    shop: String,
    value: String,
    points: Number,
    code: String
});

const Voucher = new mongoose.model("Voucher", voucherSchema)

// use static authenticate method of model in LocalStrategy
passport.use(User.createStrategy());

// use static serialize and deserialize of model for passport session support
passport.serializeUser(function(user, done) {
    done(null, user.id);
});
passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({...req.user, err: "no"})
    } else {
        res.json({err: "login"})
    }
})

app.get("/api/logout", function(req, res){
    req.logout((err) => {
        if(err){
            console.log(err);
        }
    });
});


app.post("/api/register", function(req, res){

    const newUser = new User({
        username: req.body.username,
        phone: "",
        name: "",
        adress: "",
        role: "client", 
        points:0
    })

    User.register(newUser, req.body.password, function(err, user){
      if (err) {
        res.json({err: err});
      } else {
        passport.authenticate("local")(req, res, function(){
            res.json({...user, err: "no"});
        });
      }
    });
  
  });

app.post('/api/login', (req, res) => {

    const user = new User({
        username: req.body.username,
        password: req.body.password
      });
    
      req.login(user, function(err){
        if (err) {
            res.json({err: err});
        } else {
          passport.authenticate("local")(req, res, function(){
            res.json({...user, err: "no"});
          });
        }
      });
});

app.post("/api/updateuser", (req, res) => {

    User.updateOne({_id: req.user._id}, {...req.body, _id: req.user.id}, (err)=>{
        if (!err){
            res.json({err: "no"});
        } else {
            console.log(err);
            res.json({err: err});
        }
    })
});

app.post('/api/neworder', (req, res) => {
    if (req.isAuthenticated()){
        const newOrder = new Order ({
            completed: false,
            pointsRecived: 0,
            userId: req.user.id,
            adress: req.body.adress,
            phone: req.body.phone
        });

        newOrder.save((err)=> {
            if (!err){
                res.json({err:"no"})
            } else {
                res.json({err: err})
            }
        })
    } else {
        res.json({err: "login"})
    }
    
})

app.get('/api/orders', (req, res) => {

    var count = 0;

    Order.count({completed: false}, (err, result) => {
        count = result
    });

    Order.find({completed: false}, {}, {skip: req.query.skip, limit:req.body.skip+10}, (err, results) => {
        if (!err){
            res.json({err: "no", results: results, count: count});
        } else {
            res.json({err: err});
        }
    })
});

app.get('/api/completeorder', (req, res) => {

    Order.updateOne({_id: req.query.id}, {pointsRecived: req.query.reward, completed: true}, (err, response) => {
        if (!err) {
            User.findOneAndUpdate({_id: req.query.userId}, {$inc : {points : Number(req.query.reward)}}, (err, response) => {
                if (!err){
                    res.json({err: "no"})
                }
            })
        } else {
            res.json({err: err})
        }
    })
})

app.get("/api/userorders", (req, res) => {
    if (req.isAuthenticated){
        Order.find({userId: req.user._id}, (err, result) => {
            if (!err){
                res.json({result: result, err: "no"})
            } else {
                res.json({err: err})
            }
        })
    } else {
        res.json({err: "user not auth"})
    }
    
})

app.get("/api/vouchers", (req, res) => {
    Voucher.find({}, (err, result) => {
        if (!err) {
            res.json({"vouchers": result})
        } else {
            res.json({"err": err})
        }
    })
})

app.post("/api/new-voucher", (req, res) => {
    if (req.isAuthenticated()) {
        // req.body.shop req.body.value req.body.points req.body.code

        const newVoucher = new Voucher({...req.body});

        newVoucher.save((err) => {
            if (err) {
                res.json({answ: err}) 
            } else {
                res.json({answ: "ok"})
            }
        })
    } else {
        res.json({answ: "auth-err"})
    }
})

app.get("/api/voucher/delete", (req, res) => {

    Voucher.deleteOne({_id: req.query.voucherid}, (err) => {
        if (err){
            console.log(err);
        }
        res.json({ok: ""})
    });

})

app.get("/api/voucher/buy", (req, res) => {
    //req.query.voucherId


    if (!req.query.voucherId){
        res.status(201).json({err: "Error purchasing this voucher. Please try again later"})
    } else if (!req.user._id) {
        res.status(202).json({err: "User is not logged in"})
    } else {
        Voucher.findOne({_id: req.query.voucherId}, (err, voucher) => {
            if (!err) {
                User.findOneAndUpdate({_id: req.user._id}, { $inc: { points: -voucher.points } }, (err) => {
                    if (!err){
                        res.status(200).json({voucherCode:voucher.code})
                    } else {
                        res.status(203).json({err: err})
                        console.log(err);
                    }
                })
            } else {
                res.status(203).json({err: err})
                console.log(err);

            }
        })
    }
})

app.listen(3001, () => {
    console.log("Server started on port 3001");
})

