require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT;
const Joi = require('joi');
const users = require('./userStore.js')
const { v4: uuidv4 } = require('uuid');
const otps = require('./otpStore.js')


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
    };

    const userAlreadyExist = users.find(user => user.email === email || user.phone === phone);

    if (userAlreadyExist){
        res.status(400).json({
            status: false,
            message: "Account already exist"
        })
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
    users.push(tempUser);

     // To generate a random OTP
    const otp = Math.floor( 10000 + Math.random() * 90000 );

    // Creats a temp store for the otp

    const tempOtp = {
         otpId: uuidv4(),
         otp,
         email,
         date: new Date()
    }



    // We keep the OTP in a container
    otps.push(tempOtp)



})

app.listen(port, () => {
    console.log(`We are listeniong on port ${port}`);
})