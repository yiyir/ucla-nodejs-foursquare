var express = require('express')
var router = express.Router();

//Mysql database/server credentials: update to final server deployment
var mysql_host = ''
var mysql_user = ''
var mysql_pwd = ''
var mysql_database = ''

//Foursquare credentials: update for higher limits of queries
var fsqr_client_id = ''
var fsqr_client_secret = ''
var foursquare = (require('foursquarevenues'))(fsqr_client_id, fsqr_client_secret);

var mysql = require('mysql')

router.post('/', requestHandler);

//Get distance between coordinates, using Haversine formula (https://en.wikipedia.org/wiki/Haversine_formula)
function getDistanceInKm(lat1,lon1,lat2,lon2) {
	var R = 6371; // Radius of the earth in km
	var dLat = (lat2-lat1) * (Math.PI/180);
	var dLon = (lon2-lon1) * (Math.PI/180); 
	var a = 
		Math.sin(dLat/2) * Math.sin(dLat/2) +
		Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
		Math.sin(dLon/2) * Math.sin(dLon/2)
		;
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
	var d = R * c; // Distance in km
	return d;
}

function getElapsedTimeInMinutes(timestamp_one, timestamp_two) {
	return (timestamp_two-timestamp_one)/1000/60;
}

//Given an array of values, calculate average
function getAvg(coordinates) {
	return coordinates.reduce(function(p, c){
		return p + c;
	}) / coordinates.length;
}

//Condense the clusters again using motionfilter restraint
async function superClusters(clusterCollection, motionfilter) {
	var venueList = [];
	var coordinatePairs=[];
	// check the orginial length 
	var len = clusterCollection.length;
	console.log("len is: "+len);
	console.log(clusterCollection);

	// compare neighboring clusters and remove duplicates using motionfilter
	var superCluster = []
	var startCluster = clusterCollection[0]
	superCluster.push(startCluster)
	for (i = 1; i < clusterCollection; i++) {
		var currentCluster = clusterCollection[i]
		if (getDistanceInKm(startCluster[0], startCluster[1], currentCluster[0], currentCluster[1])*1000 <= motionfilter) continue;
		
		superCluster.push(currentCluster)
		startCluster = currentCluster
	}

	// check the new length 
	len = superCluster.length;
	console.log("now the length is: "+len);

	// get the venue names of the resulting super clusters
	for(k=0;k<len;k++){
		var temp = superCluster[k];
	 	var params = {
		"ll": temp[0]+ "," + temp[1],
		"radius": 200
		}
		if(temp[0]!=0 && temp[1]!=0){
			coordinatePairs.push(temp);
			venueList.push(await new Promise(function(resolve, reject) {
  				foursquare.getVenues(params, function(err, results){
				if(err) {
					console.log("Foursquare error!");
					return;
				}
				var venues = results.response.venues;
				var venuesNames = []
				venues.forEach(function(element, index){
					venuesNames.push(element.name)
				})
				resolve(venuesNames);
    			})
			}));
	 	}
	}
	return {coordinatePairs,venueList};
}


// Given http post requests with headers('deviceid', 'timefilter', 'motionfilter', 'starttime', 'endtime'),return with the GPS coordinates and venue names of the valid locations
function requestHandler(req, res, next) {
		var deviceid = req.get('deviceid');
		var starttime = req.get('starttime');
		var endtime = req.get('endtime');
		var timefilter = req.get('timefilter');
		var motionfilter = req.get('motionfilter');

		console.log("Processing... \nDevice: %s, Time Threshold: %s, Motion Threshold: %s", deviceid, timefilter, motionfilter)

		var db = mysql.createConnection({
			host: mysql_host,
			user: mysql_user,
			password: mysql_pwd,
			database: mysql_database
		})

		db.connect(function(err) {
			if (err) {
				console.log("db connection error!");
				res.send('[]')
				res.end()
			}
			console.log("Connected to MySQL...");
			db.query(
				"SELECT double_latitude, double_longitude, timestamp from locations WHERE device_id = '"+ deviceid + "' AND timestamp BETWEEN '"+ starttime + "' AND '"+ endtime + "' AND accuracy < 75 ORDER BY timestamp ASC", 
				async function( err, result){
					if (err) {
						console.log("db query error!");
						db.end()
						res.send('[]')
						res.end()
					}
					var locations = JSON.parse(JSON.stringify(result)); //convert SQL query result to JSON
					if (locations.length == 0) {
						db.end()
						res.send('[]')
					} else {
						console.log(locations.length);
						// console.log(locations);
						for(i = 0;i<locations.length;i++){
							let element = locations[i];
							if(element.double_latitude == 0 || element.double_longitude == 0){
								locations.splice(i,1);
								i--;
							}
						}
						var cluster = [];
						var clusters = [];
						var start = locations[0];
						cluster.push(start)
						for( i = 1; i < locations.length; i++) {
							var current = locations[i];
							if(getDistanceInKm(start.double_latitude, start.double_longitude, current.double_latitude, current.double_longitude)*1000 <= motionfilter ) {
								//same cluster: within distance 
								cluster.push(current);
							} else {
								if(getElapsedTimeInMinutes(cluster[0].timestamp, cluster[cluster.length-1].timestamp) >= timefilter ){
									var latitudes = [];
									var longitudes = [];
									for(ll = 0; ll < cluster.length; ll++) {
										latitudes.push(cluster[ll].double_latitude)
										longitudes.push(cluster[ll].double_longitude)
									}
									clusters.push( [getAvg(latitudes), getAvg(longitudes), cluster[0].timestamp, cluster[cluster.length-1].timestamp] );
								}
								start = current;
								cluster=[];
								cluster.push(start);
							}
						}
						if(clusters.length==0){
							var latitudes = [];
							var longitudes = [];
							for(ll = 0; ll < cluster.length; ll++) {
								latitudes.push(cluster[ll].double_latitude)
								longitudes.push(cluster[ll].double_longitude)
							}
							clusters.push([getAvg(latitudes), getAvg(longitudes)]);
						}
						let ourresult = await superClusters(clusters, motionfilter);
						res.send(JSON.stringify(ourresult))
						db.end()
						res.end()
					}
				}
			)
		})
}

module.exports = router;

