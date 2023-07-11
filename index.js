require("dotenv").config();
const express = require("express");
const app = express();
const bodyParser = require('body-parser')
const port = process.env.PORT;
const Joi = require('joi');
//const userStore = require('./userStore.js');
const { v4: uuidv4 } = require('uuid');
//const otpStore = require('./otpStore.js');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(bodyParser.json())


let userStore = [];

const otpStore = [];


app.get('/', (req,res) => {
    res.json({
        status: true,
        message: "Welcome to our Job portal, we hope you enjoy your stay here."
    })
});

app.post('/signup', (req,res) => {

    const signUpSchema = Joi.object({
        firstname: Joi.string().required(),
        lastname: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().required(),
        password: Joi.string().required()
    });

    const { firstname, lastname, email, phone, password } = req.body;

    const { value, error } = signUpSchema.validate(req.body);

    if (error !== undefined){
        res.status(400).json({
            status: false,
            message: error.details[0].message
        })
        return
    };

    const userAlreadyExist = userStore.find(user => user.email === email || user.phone === phone);

    if (userAlreadyExist){
        res.status(400).json({
            status: false,
            message: "Account already exist"
        })
    return 
    };

    // To create the user
    const tempUser = {
        id: uuidv4(),
        firstname,
        lastname,
        email,
        phone,
        password,
        status: "Inactive",
        registeredDate: new Date()
    };
    // To send the created into the user store or database
    userStore.push(tempUser);

     // To generate a random OTP
    const otp = generateOtp();

    // Creats a temp store for the otp
    const tempOtp = {
         otpId: uuidv4(),
         otp,
         email,
         date: new Date()
    }

    // We keep the OTP in a container
    otpStore.push(tempOtp)

    // We then send email to the user using sendgrid 

    sendEmail(email, 'OTP confirmation', `Hello ${firstname} ${lastname}, Please use ${otp} to enable your signup completion`) 

res.status(201).json({
    status: true,
    message: "You are almost there, Use the OTP sent for complete signup",
    userStore
});
});

// An endpoint to verify the otp sent to the user
app.get('/verify-otp/:email/:otp', (req,res) => {

    const { email , otp } = req.params;

    if(!email || !otp){
        res.status(400).json({
            status: false,
            message: 'Email and OTP are required'
        })
    return
    };

    const user = otpStore.find(data => data.email === email && data.otp === parseInt(otp));
   //console.log(user)
    if (!user){
        res.status(400).json({
            status: false,
            message: 'Invalid OTP'
        })
    return
    };

    //We need to check if the otp has not expired 
    const timeDifference = new Date() - new Date(user.date);
    const timeDifferenceInMinutes = Math.ceil(timeDifference/(1000 * 60));

    if (timeDifferenceInMinutes > 5){
        res.status(400).json({
            status: false,
            message: "OTP has expired"
        })
        return
    }

    // At this point we need to update the status to "active"

    const newUserStore = userStore.map(data => {

        if(data.email === email){
            data.status = 'active'
        }
        return data
    })

    // To update the users status to active after verification.
    userStore = [...newUserStore];

    sendEmail(email, 'Registration completed', 'You are welcome to our Job platform. Let us help you find yopur desired job.')

    res.status(200).json({
        status: true,
        message: "Welcome on board. Your registration is successful"
    });
})

app.get('/customer', (req,res) => {

    const { apikey } = req.headers;
    if(!apikey || apikey !== process.env.API_KEY){
        res.status(401).json({
            status: false,
            message: 'Unathourised'
        })
        return
    };

    res.status(200).json({
        status: true,
        message: 'These are all of our customers',
        userStore
    });
})

// Helpers Function : To avoid repeat of the functions in various aspect of the code
const generateOtp = () => {
    return Math.floor( 10000 + Math.random() * 90000 );
}
const sendEmail = (email, subject, message) => {
    const msg = {
        to: email,
        from: process.env.SENDER_EMAIL, 
        subject: subject,
        text: message
      };

sgMail.send(msg)
.then(() => {})
.catch((error) => {});
}

app.listen(port, () => {
    console.log(`We are listening on port ${port}`);
})




