const request = require("request");
const sleep = require("sleep");

function doWork() {
  let options = {
    method: "POST",
    url: "http://localhost:5279",
    headers: {
      "Content-Type": "application/json"
    },
    body: { method: "claim_list_mine" },
    json: true
  };

  request(options, async function(error, response, body) {
    if (error) throw new Error(error);

    if (body.hasOwnProperty("error")) {
      console.error(body.error);
    } else {
      let resultSet = body.result;

      let channelIDHolder = {
        channelID: ""
      };
      let failedVideosHolder = {
        failedVideos: []
      };

      for (let i = 0; i < resultSet.length; i++) {
        let c = resultSet[i];
        try {
          await processChannel(c, channelIDHolder, failedVideosHolder);
        } catch (e) {
          break;
        }
      }
      for (let i = 0; i < failedVideosHolder.failedVideos.length; i++) {
        let c = failedVideosHolder.failedVideos[i];
        try {
          await processChannel(c, channelIDHolder, null);
        } catch (e) {
          break;
        }
      }
    }
  });
}
async function processChannel(c, channelIDHolder, failedVideosHolder) {
  if ((c.category !== "claim" && c.category !== "update" )|| !c.value.hasOwnProperty("stream"))
    return Promise.resolve();
  let claimMetadata = c.value.stream.metadata;
  let videoID = claimMetadata.thumbnail.substr(
    claimMetadata.thumbnail.lastIndexOf("/") + 1,
    claimMetadata.thumbnail.length - 1
  );
  let videoInfo = {
    videoID: videoID,
    claimName: c.name,
    claimID: c.claim_id,
    channelID: "",
    channelName: c.channel_name,
    success: false,
    error: null
  };
  try {
    if (channelIDHolder.channelID === "")
      channelIDHolder.channelID = await getChannelID(videoID);
  } catch (e) {
    if (failedVideosHolder !== null) {
      failedVideosHolder.failedVideos.push(c);
    } else {
      videoInfo.error = e;
      console.error(JSON.stringify(videoInfo));
    }
    return Promise.resolve();
  }
  videoInfo.channelID = channelIDHolder.channelID;
  try {
    await setVideoStatus(
      videoID,
      c.name,
      c.claim_id,
      channelIDHolder.channelID,
      c.height
    );
    videoInfo.success = true;
    console.log(JSON.stringify(videoInfo));
  } catch (e) {
    videoInfo.error = e;
    return Promise.reject(console.error(JSON.stringify(videoInfo)));
  }
  sleep.msleep(50);
  return Promise.resolve();
}

function setVideoStatus(videoID, claimName, claimID, channelID, height) {
  return new Promise(function(success, reject) {
    let options = {
      method: "POST",
      url: process.env.LBRY_API + "/yt/video_status",
      headers: {
        "Cache-Control": "no-cache",
        "content-type":
          "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW"
      },
      formData: {
        auth_token: process.env.LBRY_API_TOKEN,
        youtube_channel_id: channelID,
        video_id: videoID,
        status: "published",
        published_at: Math.floor(getDateFromHeight(height) / 1000),
        claim_id: claimID,
        claim_name: claimName
      }
    };
    //console.log(options);

    request(options, function(error, response, body) {
      if (error) reject(error);
      try {
        body = JSON.parse(body);
      } catch (e) {
        return reject(e);
      }
      if (!body.hasOwnProperty("success")) {
        return reject(response.statusCode);
      }
      if (body.success === true && body.data === "ok") {
        success();
      } else {
        reject(body.error);
      }
    });
  });
}

function getChannelID(videoID) {
  return new Promise(function(success, reject) {
    let options = {
      method: "GET",
      url:
        "https://www.googleapis.com/youtube/v3/videos?part=id,+snippet&id=" +
        videoID +
        "&key=" +
        process.env.YOUTUBE_API_KEY,
      headers: { "Cache-Control": "no-cache" }
    };
    console.log(options.url);
    request(options, function(error, response, body) {
      if (error) throw new Error(error);
      try {
        body = JSON.parse(body);
      } catch (e) {
        reject(e);
      }
      if (response.statusCode !== 200 || !body.hasOwnProperty("pageInfo")) {
        return reject(response.statusCode);
      }
      if (body.pageInfo.totalResults > 0) {
        return success(body.items[0].snippet.channelId);
      } else {
        return reject("more results for this video???");
      }
    });
  });
}

doWork();
//console.log(new Date(getDateFromHeight(350000)).toISOString());
function getDateFromHeight(height) {
  const secondsPerBlock = height > 380000 ? 154.76956721342705 : 161.28; // in theory this should be 150, but in practice its closer to 161
  let origin = Date.UTC(2016, 6, 23, 1, 49, 0, 0);
  return origin + height * secondsPerBlock * 1000;
}
