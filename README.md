## GoogleMapTimelineViewer

<img width="1264" height="900" alt="image" src="https://github.com/user-attachments/assets/934f8360-8142-41cb-ba08-6405503e499a" />

In 2024, Google announced that it would store timeline data (such as location history) locally on the device itself, rather than in a cloud-based system. Because the data is now stored on the device, the desktop version of the timeline viewer was discontinued.

If, like me, you want to view years' worth of timeline data, this project makes that possible.

Note that since it uses OpenStreetMap as the base map instead of Google Maps, no API key is required and Serverless.

DEMO:https://makinux.github.io/GoogleMapTimelineViewer2/

## Fature
・Time Filter

・Time Slider Animation

・Photo Viewer (Optional: Cluster, Thumbnail size)

・Time filtered KML & KMZ Export (Optional:The KMZ file will include a thumbnail if a photo has been uploaded.)

・None API & Serverless

・Very fast & Ultra Lite

## Exporting Data from Your Device

For Android: Open the Settings app, tap "Location," "Location Services," then "Timeline," and then tap "Export Timeline Data."

For iOS: Open the Google Maps app, tap your profile picture, select "Settings," and then tap "Location & Privacy." Tap "Export Timeline Data."

Save the exported file as "Timeline.json." 
Transfer the JSON file to your computer and save it to your preferred location.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Build app:
   `npm run build`
 
