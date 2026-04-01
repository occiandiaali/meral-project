//require("dotenv").config();
import "dotenv/config.js";

import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Serve static frontend
app.use(express.static("public"));
app.use(express.json());

// Upload route (image or text)
// app.post("/upload", upload.single("file"), async (req, res) => {
//   const { note } = req.body;
//   console.log("Uploaded note ", note);

//   let fileUrl;
//   if (note) {
//     // Store note as a text file
//     const { data, error } = await supabase.storage
//       .from("selfdestruct")
//       .upload(`notes/${Date.now()}.txt`, Buffer.from(note), {
//         contentType: "text/plain",
//       });
//     if (error) return res.status(500).json({ error });
//     fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/selfdestruct/${data.path}`;
//   } else if (req.file) {
//     // Store image
//     const { data, error: dbError } = await supabase.storage
//       .from("selfdestruct")
//       .upload(
//         `images/${Date.now()}-${req.file.originalname}`,
//         req.file.buffer,
//         {
//           contentType: req.file.mimetype,
//           upsert: true,
//         },
//       );
//     if (dbError) {
//       console.error("DB Error: ", dbError);
//       return res.status(500).json({ error: dbError.message });
//     }
//     fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/selfdestruct/${data.path}`;
//   }

//   // Save metadata in DB
//   const { data: record, error: dbError } = await supabase
//     .from("links")
//     .insert([{ url: fileUrl, expires_at: new Date(Date.now() + 60 * 1000) }])
//     .select()
//     .single();

//   if (dbError) return res.status(500).json({ error: dbError });
//   res.json({ link: `/view/${record.id}` });
// });
// Upload route (image or text)
app.post("/upload", upload.single("file"), async (req, res) => {
  const { note } = req.body;
  let fileUrl;

  if (note) {
    const { data, error } = await supabase.storage
      .from("selfdestruct")
      .upload(`notes/${Date.now()}.txt`, Buffer.from(note), {
        contentType: "text/plain",
        upsert: true,
      });
    if (error) return res.status(500).json({ error: error.message });
    fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/selfdestruct/${data.path}`;
  } else if (req.file) {
    const { data, error } = await supabase.storage
      .from("selfdestruct")
      .upload(
        `images/${Date.now()}-${req.file.originalname}`,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
          upsert: true,
        },
      );
    if (error) return res.status(500).json({ error: error.message });
    fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/selfdestruct/${data.path}`;
  }

  // Insert record with no expiry yet
  const { data: record, error: dbError } = await supabase
    .from("links")
    .insert([{ url: fileUrl, expires_at: null }])
    .select()
    .single();

  if (dbError) return res.status(500).json({ error: dbError.message });
  //res.json({ link: `/view/${record.id}` });
  res.json({ link: `/private_message/${record.id}` });
});

// View route
// app.get("/view/:id", async (req, res) => {
//   const { data, error } = await supabase
//     .from("links")
//     .select("*")
//     .eq("id", req.params.id)
//     .single();

//   if (error || !data) return res.status(404).send("Link not found");

//   const now = new Date();
//   if (new Date(data.expires_at) < now) {
//     return res.status(410).send("This content has expired");
//   }

//   // Show HTML with countdown
//   res.send(`
//     <html>
//       <body>
//         <h1>Self-Destruct Content</h1>
//         <p>Expires in 60 seconds...</p>
//         <div>
//           ${
//             data.url.endsWith(".txt")
//               ? `<iframe src="${data.url}" width="400" height="200"></iframe>`
//               : `<img src="${data.url}" width="400"/>`
//           }
//         </div>
//         <script>
//           setTimeout(() => {
//             document.body.innerHTML = "<h2>Content destroyed</h2>";
//             fetch('/destroy/${data.id}', { method: 'POST' });
//           }, 60000);
//         </script>
//       </body>
//     </html>
//   `);
// });
//app.get("/view/:id", async (req, res) => {
app.get("/private_message/:id", async (req, res) => {
  let { data, error } = await supabase
    .from("links")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).send("Link not found");

  const now = new Date();

  // If first view, set expiry and log viewer
  if (!data.expires_at) {
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000);
    const firstViewer = req.headers["x-forwarded-for"] || req.ip;

    const { error: updateError } = await supabase
      .from("links")
      .update({ expires_at: expiresAt, first_viewer: firstViewer })
      .eq("id", req.params.id)
      .is("expires_at", null); // only first viewer sets expiry

    if (updateError) return res.status(500).send("Failed to set expiry");

    data.expires_at = expiresAt;
    data.first_viewer = firstViewer;
  }

  // Check if expired
  if (new Date(data.expires_at) < now) {
    return res.status(410).send("This content has expired");
  }

  // Show HTML with countdown
  const remainingMs = new Date(data.expires_at) - now;
  const remainingSec = Math.floor(remainingMs / 1000);

  res.send(`
  <html>
    <body>
      <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;margin:4px;padding:6px;background-color:orange;">
      <h1>Your private message</h1>
      <p>Self-destructs in <span id="countdown"></span></p>
      <div>
        ${
          data.url.endsWith(".txt")
            ? `<iframe src="${data.url}" width="400" height="200"></iframe>`
            : `<img src="${data.url}" width="400"/>`
        }
      </div>
      </div>
      <script>
        let remainingMs = ${remainingMs};
        const countdownEl = document.getElementById("countdown");

        function updateCountdown() {
          let totalSeconds = Math.floor(remainingMs / 1000);
          let minutes = Math.floor(totalSeconds / 60);
          let seconds = totalSeconds % 60;
          countdownEl.textContent = \`\${minutes}:\${seconds.toString().padStart(2, '0')}\`;
          remainingMs -= 1000;

          if (remainingMs <= 0) {
            document.body.innerHTML = "<div style='display:flex;flex-direction:column;justify-content:center;align-items:center;padding:6px;margin:6px;'><h2>Message destroyed</h2></div>";
            fetch('/destroy/${data.id}', { method: 'POST' });
          }
        }

        updateCountdown(); // initial render
        setInterval(updateCountdown, 1000);
      </script>
    </body>
  </html>
`);
});

// Destroy route
app.post("/destroy/:id", async (req, res) => {
  await supabase.from("links").delete().eq("id", req.params.id);
  res.sendStatus(200);
});

// Admin routes
app.get("/dashboard", async (req, res) => {
  // For now, assume a single owner "admin"
  const { data, error } = await supabase
    .from("links")
    .select("*")
    .eq("owner", "admin")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).send("Failed to load dashboard");

  const rows = data.map(
    (link) => `
      <tr>
        <td>${link.id}</td>
        <td><a href="/view/${link.id}" target="_blank">${link.url}</a></td>
        <td>${link.expires_at ? new Date(link.expires_at).toLocaleString() : "Not yet viewed"}</td>
        <td>${link.first_viewer || "—"}</td>
        <td>
          <form method="POST" action="/admin/delete/${link.id}" style="display:inline;">
            <button type="submit">Delete</button>
          </form>
        </td>
      </tr>
    `,
  );

  res.send(`
    <html>
      <body>
        <h1>Dashboard</h1>
        <table border="1" cellpadding="5">
          <tr><th>ID</th><th>URL</th><th>Expires At</th><th>First Viewer</th><th>Actions</th></tr>
          ${rows.join("")}
        </table>
      </body>
    </html>
  `);
});

app.post("/admin/delete/:id", async (req, res) => {
  // First fetch the link to get the storage path
  const { data, error } = await supabase
    .from("links")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).send("Link not found");

  // Delete from storage
  const storagePath = data.url.split("/selfdestruct/")[1]; // extract path
  await supabase.storage.from("selfdestruct").remove([storagePath]);

  // Delete from DB
  await supabase.from("links").delete().eq("id", req.params.id);

  res.redirect("/dashboard");
});

app.listen(process.env.PORT, () => {
  console.log(`Server is now running on http://localhost:${process.env.PORT}`);
});
