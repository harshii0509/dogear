// Counts docs page views in PostHog, the same way as the rest of dogear.harshux.com. Nothing is stored
// in the browser, so a returning visitor counts again. Mintlify runs every .js file here on every page.
(function () {
  if (location.hostname !== "dogear.harshux.com") return;

  // Set by opening the site with ?me=1, to leave your own browsers out of the numbers.
  try {
    if (localStorage.getItem("dogear-not-me") === "1") return;
  } catch (e) {
    // No storage, so no flag: count the page.
  }

  // Public by design: this key can only send events.
  var KEY = "phc_Azjw5QQ5bbxXz9gREpHK6SKbntQ4KC5ECWAu6z6hjAZp";
  var visit = crypto.randomUUID();
  var referrer = document.referrer;

  function countPage() {
    fetch("/ingest/e/", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event: "$pageview",
        distinct_id: visit,
        properties: {
          site: "dogear-docs",
          $current_url: location.href,
          $host: location.host,
          $pathname: location.pathname,
          $referrer: referrer || "$direct",
          $referring_domain: referrer ? new URL(referrer).hostname : "$direct",
          $process_person_profile: false,
        },
      }),
    }).catch(function () {
      // Analytics must never get in the way of the docs.
    });
  }

  countPage();
  // Moving between docs pages swaps the content without a reload.
  window.addEventListener("mintlify:navigate", countPage);
})();
