function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { eventTitle, userId, username, globalName, serverNick, display,
            rsvp, timestamp, messageId, channelId } = body;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets()[0];

    const desired = [
      "Event","UserID","Username","GlobalName","ServerNick","Display",
      "RSVP","Timestamp","MessageID","ChannelID"
    ];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(desired);
    } else {
      const existing = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      const missing = desired.filter(h => existing.indexOf(h) === -1);
      if (missing.length) {
        const newHeaders = existing.concat(missing);
        sheet.getRange(1,1,1,newHeaders.length).setValues([newHeaders]);
      }
    }

    const headers = sheet.getRange(1,1,1, sheet.getLastColumn()).getValues()[0];
    const idx = {}; headers.forEach((h,i)=> idx[h]=i);

    function rowFrom() {
      const row = new Array(headers.length).fill("");
      const set = (k,v)=>{ if (k in idx) row[idx[k]] = v; };
      set("Event", eventTitle);
      set("UserID", String(userId));
      set("Username", username || "");
      set("GlobalName", globalName || "");
      set("ServerNick", serverNick || "");
      set("Display", display || "");
      set("RSVP", rsvp);
      set("Timestamp", timestamp);
      set("MessageID", String(messageId));
      set("ChannelID", String(channelId));
      return row;
    }

    // Upsert by (MessageID, UserID)
    const lastRow = sheet.getLastRow();
    let updated = false;
    if (lastRow >= 2) {
      const data = sheet.getRange(2,1,lastRow-1, sheet.getLastColumn()).getValues();
      for (let i = 0; i < data.length; i++) {
        const r = data[i], rowNo = i+2;
        if (String(r[idx["MessageID"]]) === String(messageId) &&
            String(r[idx["UserID"]])    === String(userId)) {
          sheet.getRange(rowNo,1,1,headers.length).setValues([ rowFrom() ]);
          updated = true;
          break;
        }
      }
    }
    if (!updated) sheet.appendRow( rowFrom() );

    // Totals for this messageId
    const all = sheet.getDataRange().getValues();
    let yes=0,no=0,maybe=0;
    for (let i=1;i<all.length;i++){
      if (String(all[i][idx["MessageID"]]) === String(messageId)) {
        const v = (all[i][idx["RSVP"]]||"").toString().toLowerCase();
        if (v==="yes") yes++; else if (v==="no") no++; else if (v==="maybe") maybe++;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ok:true, totals:{yes,no,maybe}}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
