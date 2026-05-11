## GoogleMapTimelineViewer
In 2024, Google announced that it would store timeline data (such as location history) locally on the device itself, rather than in a cloud-based system. Because the data is now stored on the device, the desktop version of the timeline viewer was discontinued.

If, like me, you want to view years' worth of timeline data, this project makes that possible.

Note that since it uses OpenStreetMap as the base map instead of Google Maps, no API key is required.

## Exporting Data from Your Device
For Android: Open the Settings app, tap "Location," "Location Services," then "Timeline," and then tap "Export Timeline Data."
For iOS: Open the Google Maps app, tap your profile picture, select "Settings," and then tap "Location & Privacy." Tap "Export Timeline Data."

Save the exported file as "Timeline.json." 
Transfer the JSON file to your computer and save it to your preferred location.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
