// Extract lat lng from google map url

export const extractLatLngFromMapLink = (
  url?: string
) => {

  if (!url) return null;


  // google url format with @lat,lng
  const match =
    url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);


  if (!match) return null;


  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  };

};




// calculate distance KM

export const calculateDistanceKm = (
  lat1:number,
  lon1:number,
  lat2:number,
  lon2:number
)=>{


const R = 6371;


const dLat =
(lat2-lat1) * Math.PI / 180;


const dLon =
(lon2-lon1) * Math.PI / 180;



const a =
Math.sin(dLat/2) *
Math.sin(dLat/2)
+
Math.cos(lat1*Math.PI/180)
*
Math.cos(lat2*Math.PI/180)
*
Math.sin(dLon/2)
*
Math.sin(dLon/2);



const c =
2*Math.atan2(
Math.sqrt(a),
Math.sqrt(1-a)
);


return R*c;

};