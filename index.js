require("dotenv").config();
const express = require("express");
const app = express();
const bodyParser = require('body-parser')
const port = process.env.PORT;
const bcrypt = require('bcrypt');
const saltRounds = 10;
const Joi = require('joi');
const axios = require('axios'); 
let userStore = require('./userStore.js');
const { v4: uuidv4 } = require('uuid');
const otpStore = require('./otpStore.js');
const sgMail = require('@sendgrid/mail');
const authorization = require("./authorization.js");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(bodyParser.json())

const jobApplicationStore = [];
const jobStore = [];


app.get('/', (req,res) => {
    res.json({
        status: true,
        message: "Welcome to our Job portal, we hope you enjoy your stay here."
    })
});

app.post('/signup', async(req,res) => {

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

    const responseSalt = await bcrypt.genSalt(saltRounds);
    
    if (!responseSalt){
        res.status(500).json({
            status: false,
            message: 'Sorry , you cannot login this time, try again later'
        })
    }
    const responseHash = await bcrypt.hash(password, responseSalt);

    if (!responseHash){
        res.status(500).json({
            status: false,
            message: 'Sorry , you cannot login this time, try again later'
        })
    }
         

    // To create the user
    const tempUser = {
        id: uuidv4(),
        firstname,
        lastname,
        email,
        phone,
        salt:responseSalt,
        password: responseHash,
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
            message: 'Invalid Email and OTP'
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
});


app.get('/resend-otp/:email', (req,res) => {

    const { email } =req.params;

    if (!email){
        res.status(400).json({
            status: false,
            message: 'Email is required'
        })
    return
    };

    isEmailAlready = userStore.find(data => data.email === email);

    if (!isEmailAlready){
        res.status(400).json({
            status: false,
            message: 'Account does not exist'
        })
    return
    };

    const otp = generateOtp();
    const tempOtp = {
        otpId: uuidv4(),
        otp,
        email,
        date: new Date()
   }
   // We keep the OTP in a container
   otpStore.push(tempOtp)

   sendEmail(email, 'OTP resent', `Hello ${firstname} ${lastname}, Please use ${otp} to enable your signup completion`) 

   res.status(201).json({
       status: true,
       message: "You are almost there, Use the OTP sent for complete signup",
       userStore
   });

})


app.post('/login', async(req,res) => {

    const loginSchema = Joi.object({
        emailOrPhone: Joi.string().required(),
        password: Joi.string().required()
    });

    const { emailOrPhone, password } = req.body;
    const { error , value } = loginSchema.validate(req.body);

    if (error !== undefined){
        res.status(400).json({
            status: false,
            message: error.details[0].message
        })
       return
    };

    const userExist = userStore.find(data => data.email === emailOrPhone || data.phone === emailOrPhone);

    if (!userExist){
        res.status(400).json({
            status: false,
            message: "Invalid email or password"
        })
        return 
    }

    const responseHash = await bcrypt.hash(password, userExist.salt);

    if (!responseHash){
        res.status(500).json({
            status: false,
            message: 'Sorry , you cannot login this time, try again later'
        })
    };

    if (responseHash !== userExist.password){
        res.status(400).json({
            status: false,
            message: 'Invalid email or password'
        })
        return
    };

    if (userExist.status !== 'active'){
        res.status(400).json({
            status: false,
            message: 'Account verification pending'
        })
        return 
    };

    res.status(200).json({
        status: true,
        message: 'You are logged in successfully'
    });
})



app.get('/jobs', async (req,res) => {

    const { apikey } = req.headers;
    const length = req.query.length || 10;
    const category = req.query.category || '';
    const company = req.query.company || '';

    const response = authorization(apikey)
    if (!response){
        res.status(401).json({
            status: false,
            message: 'Unathourised'
        })
        return
    };

   const result = await axios({
        method: 'get',
        url: `${process.env.REMOTE_API_BASEURL}/remote-jobs?limit=${length}&category=${category}&company_name=${company}`
      });

    res.status(200).json({
        status: true,
        count: result.data.jobs.length,
        data: result.data.jobs  
    })
});

app.get('/jobs/categories', async (req,res) => {

    const response = await axios({
        method: 'get',
        url: `${process.env.REMOTE_API_BASEURL}/remote-jobs`
      });

    const responseJobs = response.data.jobs;

    

    const jobsCategories = responseJobs.map(items => items.category)
    

     // function to help remove duplicates in the Array

    // function removeDuplicates(arr) {
        //return Array.from(new Set(arr));
      //};

    function removeDuplicates(arr) {
       return arr.filter((element, index) => arr.indexOf(element) === index);
    }
      
    const uniqueJobsCategories = removeDuplicates(jobsCategories)

    res.status(200).json({
        status: true,
        data: uniqueJobsCategories
    });
});

app.post('/jobs/apply', async(req,res) => {

    const { fullname, address, email, jobId, yearsOfExperiece, qualifications, status } = req.body;

    const jobLoginSchema = Joi.object({
        fullname: Joi.string().required(),
        address: Joi.string().required(),
        email: Joi.string().email().required(),
        yearsOfExperiece: Joi.string().required(),
        qualifications: Joi.string().required().valid('SSCE', 'BSc', 'MSc', 'PhD'),
        jobId: Joi.string().required(),
        status:Joi.string().required()
    });

    const { value, error } = jobLoginSchema.validate(req.body);

    if (error !== undefined){
        res.status(400).json({
            status: false,
            message: error.details[0].message
        })
    return
    };

    const response = await axios({
        method: 'get',
        url: `${process.env.REMOTE_API_BASEURL}/remote-jobs`
      });

   const responseJobs = response.data.jobs;
   const checkId = responseJobs.find( item => item.id  === parseInt(jobId));

   if (!checkId){
       res.status(200).json({
           status: false,
           message:'Invalid job Id'
     })
    return
   };

    const tempJob = {
      fullname,
      address,
      email,
      jobId,
      yearsOfExperiece,
      qualifications,
      status: 'submitted'
    };

    jobApplicationStore.push(tempJob);

    sendEmail(email, 'Job Application Update', 'Your job application is submitted successfully.')

    res.status(200).json({
        status: true,
        message: 'Application submission successful'
    }) 
});

app.get('/jobs/application-status/:email/:jobId' , (req,res) => {

    const { email, jobId } = req.params;

    if (!email){
        res.status(400).json({
            status: false,
            message:'Email is required'
        })
    return
    };

    const userExist = jobApplicationStore.find( item => item.email === email || item.id === jobId );
    if (!userExist){
        res.status(400).json({
            status: false,
            message:'Hello user, You have not applied for any job yet. Kindly apply for a job today'
        })
    return
    };

    const applicationStatus = userExist.status

    res.status(400).json({
        status: true,
        message: "Your job application is found",
        data: applicationStatus
    })
});

app.put('/admin/applicationStatus/update/:email/:jobId/:status' , (req,res) => {

    const { apikey } = req.headers;
    const { email, jobId, status } =req.params;
    const response = authorization(apikey);

    if (!response){
        res.status(401).json({
            status: false,
            message: 'Unathourised'
        })
        return
    };

    const applicationExist = jobApplicationStore.find(item => item.email === email && item.id === jobId)

    if (!applicationExist){
        res.status(400).json({
            status: false,
            message: "This Job was not applied for by this user"
        })
        return
    };

    applicationExist.status = status;


    sendEmail( email, "Application status update", `Hello your application status is now on ${status}. If there is further update we would inform you.` )

    res.status(200).json({
        status: true,
        message: "updated",
        data: jobApplicationStore
    })
});

app.get('/jobs/myApplications/:email', (req,res) => {

    const { email } = req.params;

    if (!email){
        res.status(400).json({
            status:false,
            message: 'Invalid email'
        })
    return
    };

    const allJobApplication = jobApplicationStore.filter(item => item.email === email);

    if (!allJobApplication){
        res.status(400).json({
            status: false,
            message: "No job application yet! "
        })
    return
    };

    res.status(200).json({
        status: true,
        message: "These are your job applications",
        data: allJobApplication
    })
})


app.get('/admin/customers', (req,res) => {

    const { apikey } = req.headers;
    const response = authorization(apikey);

    if (!response){
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
});


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
