# ucla-nodejs-foursquare

- Overview

This is a node.js application using Express framework, ready to be deployed on EC2 instances. This app specifically creates endpoint for HTTP POST request to get the locations data(GPS coordinates and timestamps) from your mysql database and provide venue names of the resulting locations using Foursquare API.   


- Post request example:

Request url: http://your-server-url/

Headers:
{
	deviceid: ad79cd03-9417-4418-8165-6ab0952d90c6
	starttime: 1533931511800
	endtime: 1534189442150
	timefilter: 15
	motionfilter: 150
}


- You will need:

Your MySQL database/server credentials

To set it up on the server:
Instructions on how to deploy the app on a AWS ElasticBeanstalk instance could be found here: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs_express.html


For Foursquare API credentials: https://developer.foursquare.com/

