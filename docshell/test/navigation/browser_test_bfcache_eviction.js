add_task(async function() {
  // We don't want the number of total viewers to be calculated by the available size
  // for this test case. Instead, fix the number of viewers.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.sessionhistory.max_total_viewers", 3],
      ["docshell.shistory.testing.bfevict", true],
    ],
  });

  // 1. Open a tab
  var testPage =
    "data:text/html,<html id='html1'><body id='body1'></body></html>";
  await BrowserTestUtils.withNewTab({ gBrowser, url: testPage }, async function(
    browser
  ) {
    let testDone = {};
    if (!SpecialPowers.getBoolPref("fission.sessionHistoryInParent")) {
      // 2.  Add a promise that will be resolved when the 'content viewer evicted' event goes off
      testDone.promise = ContentTask.spawn(browser, null, async function() {
        return new Promise(resolve => {
          let webNavigation = content.docShell.QueryInterface(
            Ci.nsIWebNavigation
          );
          let { legacySHistory } = webNavigation.sessionHistory;
          // 3. Register a session history listener to listen for a 'content viewer evicted' event.
          let historyListener = {
            OnContentViewerEvicted() {
              ok(
                true,
                "History listener got called after a content viewer was evicted"
              );
              legacySHistory.removeSHistoryListener(historyListener);
              // 6. Resolve the promise when we got our 'content viewer evicted' event
              resolve();
            },
            QueryInterface: ChromeUtils.generateQI([
              Ci.nsISHistoryListener,
              Ci.nsISupportsWeakReference,
            ]),
          };
          legacySHistory.addSHistoryListener(historyListener);
        });
      });
    } else {
      // 2.  Add a promise that will be resolved when the 'content viewer evicted' event goes off
      testDone.promise = new Promise(resolve => {
        testDone.resolve = resolve;
      });
      let legacySHistory = browser.browsingContext.sessionHistory;
      // 3. Register a session history listener to listen for a 'content viewer evicted' event.
      let historyListener = {
        OnContentViewerEvicted() {
          ok(
            true,
            "History listener got called after a content viewer was evicted"
          );
          legacySHistory.removeSHistoryListener(historyListener);
          // 6. Resolve the promise when we got our 'content viewer evicted' event
          testDone.resolve();
        },
        QueryInterface: ChromeUtils.generateQI([
          Ci.nsISHistoryListener,
          Ci.nsISupportsWeakReference,
        ]),
      };
      legacySHistory.addSHistoryListener(historyListener);
    }

    // 4. Open a second tab
    testPage = `data:text/html,<html id='html1'><body id='body1'>I am a second tab!</body></html>`;
    let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, testPage);

    // 5. Navigate the first tab to 4 different pages.
    // We should get 1 content viewer evicted because it will be outside of the range.
    // If we have the following pages in our session history: P1 P2 P3 P4 P5
    // and we are currently at P5, then P1 is outside of the range
    // (it is more than 3 entries away from current entry) and thus will be evicted.
    for (var i = 0; i < 4; i++) {
      testPage = `data:text/html,<html id='html1'><body id='body1'>${i}</body></html>`;
      let pagePromise = BrowserTestUtils.browserLoaded(browser);
      await BrowserTestUtils.loadURI(browser, testPage);
      await pagePromise;
    }
    // 7. Wait for 'content viewer evicted' event to go off
    await testDone.promise;

    // 8. Close the second tab
    BrowserTestUtils.removeTab(tab2);
  });
});
