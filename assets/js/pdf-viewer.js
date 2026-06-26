(function () {
  const container = document.getElementById("pdf-viewer");
  if (!container) return;

  const pdfUrl = container.dataset.pdf;
  if (!pdfUrl) return;

  const pagesHost = document.createElement("div");
  pagesHost.className = "pdf-viewer__pages";
  const toolbar = document.createElement("div");
  toolbar.className = "pdf-viewer__toolbar";
  toolbar.innerHTML =
    '<span class="pdf-viewer__status">Loading…</span>' +
    '<button type="button" data-action="prev" aria-label="Previous page">← Prev</button>' +
    '<button type="button" data-action="next" aria-label="Next page">Next →</button>';

  let pdfDoc = null;
  let pageNum = 1;
  let pageRendering = false;
  let pageNumPending = null;
  const scale = window.devicePixelRatio > 1 ? 1.5 : 1.25;
  const canvas = document.createElement("canvas");
  pagesHost.appendChild(canvas);

  function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(function (page) {
      const viewport = page.getViewport({ scale: scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const ctx = canvas.getContext("2d");
      const renderTask = page.render({ canvasContext: ctx, viewport: viewport });
      renderTask.promise.then(function () {
        pageRendering = false;
        toolbar.querySelector(".pdf-viewer__status").textContent =
          "Page " + num + " of " + pdfDoc.numPages;
        if (pageNumPending !== null) {
          renderPage(pageNumPending);
          pageNumPending = null;
        }
      });
    });
  }

  function queueRenderPage(num) {
    if (pageRendering) {
      pageNumPending = num;
    } else {
      renderPage(num);
    }
  }

  toolbar.addEventListener("click", function (e) {
    const action = e.target.getAttribute("data-action");
    if (!action || !pdfDoc) return;
    if (action === "prev" && pageNum > 1) {
      pageNum--;
      queueRenderPage(pageNum);
    }
    if (action === "next" && pageNum < pdfDoc.numPages) {
      pageNum++;
      queueRenderPage(pageNum);
    }
  });

  container.innerHTML = "";
  container.appendChild(toolbar);
  container.appendChild(pagesHost);

  import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")
    .then(function (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
      return pdfjsLib.getDocument(pdfUrl).promise;
    })
    .then(function (pdf) {
      pdfDoc = pdf;
      renderPage(pageNum);
    })
    .catch(function () {
      container.innerHTML =
        '<p class="pdf-viewer__error">Unable to load the PDF inline. ' +
        '<a href="' +
        pdfUrl +
        '">Open or download the file</a>.</p>';
    });
})();
