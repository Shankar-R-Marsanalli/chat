const socket = io();

let selectedUser = null;
let mediaRecorder = null;
let audioChunks = [];

const usersEl = document.getElementById("users");
const messagesEl = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.getElementById("attachBtn");
const recordBtn = document.getElementById("recordBtn");
const recording = document.getElementById("recording");
const chatName = document.getElementById("chatName");
const statusEl = document.getElementById("status");


// =====================================================
// LOAD USERS
// =====================================================

async function loadUsers() {
    try {
        const response = await fetch("/api/users");
        const users = await response.json();

        if (!response.ok) {
            console.error("Could not load users:", users);
            return;
        }

        renderUsers(users);

    } catch (error) {
        console.error("Users error:", error);
    }
}


function renderUsers(users) {

    usersEl.innerHTML = "";

    const search =
        document
            .getElementById("userSearch")
            .value
            .toLowerCase();

    users
        .filter(user =>
            user.username
                .toLowerCase()
                .includes(search)
        )
        .forEach(user => {

            const div = document.createElement("div");

            div.className =
                "user" +
                (
                    selectedUser &&
                    selectedUser.id === user.id
                        ? " active"
                        : ""
                );

            div.textContent = "👤 " + user.username;

            div.onclick = () => {
                selectUser(user);
            };

            usersEl.appendChild(div);
        });
}


document
    .getElementById("userSearch")
    .addEventListener("input", loadUsers);


// =====================================================
// SELECT USER
// =====================================================

async function selectUser(user) {

    selectedUser = user;

    chatName.textContent = user.username;

    statusEl.textContent = "";

    await loadMessages();

    loadUsers();
}


// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages() {

    if (!selectedUser) {
        return;
    }

    try {

        const response =
            await fetch(
                "/api/messages/" + selectedUser.id
            );

        const messages = await response.json();

        if (!response.ok) {
            console.error(
                "Could not load messages:",
                messages
            );
            return;
        }

        messagesEl.innerHTML = "";

        messages.forEach(message => {
            renderMessage(message);
        });

        messagesEl.scrollTop =
            messagesEl.scrollHeight;

    } catch (error) {

        console.error(
            "Messages error:",
            error
        );
    }
}


// =====================================================
// DISPLAY MESSAGE
// =====================================================

function renderMessage(message) {

    const div =
        document.createElement("div");

    div.className =
        "bubble " +
        (
            message.sender_id === CURRENT_USER_ID
                ? "mine"
                : "theirs"
        );


    const body =
        document.createElement("div");


    // =================================================
    // VOICE MESSAGE
    // =================================================

    if (message.message_type === "voice") {

        const audio =
            document.createElement("audio");

        audio.controls = true;

        audio.preload = "metadata";

        audio.style.maxWidth = "100%";


        /*
         IMPORTANT:

         app.py returns:

         message.file_url

         which is the actual Supabase
         Storage URL.

         We use that URL directly.
        */

        if (message.file_url) {

            audio.src =
                message.file_url;

        } else {

            body.textContent =
                "⚠️ Audio file unavailable.";

            console.error(
                "Voice message has no file_url:",
                message
            );
        }


        // Detect audio loading errors

        audio.addEventListener(
            "error",
            function () {

                console.error(
                    "Audio could not be loaded."
                );

                console.error(
                    "Audio URL:",
                    audio.src
                );

                console.error(
                    "Message:",
                    message
                );
            }
        );


        body.appendChild(audio);

    }


    // =================================================
    // FILE
    // =================================================

    else if (message.file_path) {

        const link =
            document.createElement("a");

        link.href =
            message.file_url || "#";

        link.target = "_blank";

        link.rel =
            "noopener noreferrer";

        link.textContent =
            "📎 " +
            (
                message.file_name ||
                "Download file"
            );

        body.appendChild(link);

    }


    // =================================================
    // TEXT
    // =================================================

    else {

        body.textContent =
            message.message || "";
    }


    // =================================================
    // MESSAGE INFO
    // =================================================

    const meta =
        document.createElement("div");

    meta.className = "meta";

    meta.textContent =
        (
            message.sender_name ||
            "User"
        ) +
        " • " +
        new Date(
            message.created_at
        ).toLocaleString();


    div.appendChild(body);

    div.appendChild(meta);

    messagesEl.appendChild(div);
}


// =====================================================
// SEND TEXT MESSAGE
// =====================================================

function sendText() {

    if (!selectedUser) {

        alert(
            "Select a user first."
        );

        return;
    }


    const text =
        input.value.trim();


    if (!text) {
        return;
    }


    socket.emit(
        "send_message",
        {
            receiver_id:
                selectedUser.id,

            message:
                text
        }
    );


    input.value = "";
}


sendBtn.onclick =
    sendText;


input.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Enter") {

            sendText();
        }
    }
);


// =====================================================
// FILE ATTACHMENT
// =====================================================

attachBtn.onclick =
    function () {

        if (!selectedUser) {

            alert(
                "Select a user first."
            );

            return;
        }

        fileInput.click();
    };


fileInput.onchange =
    async function () {

        if (
            !fileInput.files[0] ||
            !selectedUser
        ) {

            return;
        }


        await uploadFile(
            fileInput.files[0],
            "file"
        );


        fileInput.value = "";
    };


// =====================================================
// UPLOAD FILE
// =====================================================

async function uploadFile(
    file,
    type
) {

    const formData =
        new FormData();


    formData.append(
        "file",
        file
    );


    formData.append(
        "receiver_id",
        selectedUser.id
    );


    formData.append(
        "message_type",
        type
    );


    try {

        console.log(
            "Uploading:",
            file.name,
            file.type,
            file.size
        );


        const response =
            await fetch(
                "/upload",
                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error(
                "Upload failed:",
                data
            );

            alert(
                data.error ||
                "Upload failed."
            );

            return;
        }


        console.log(
            "Upload successful:",
            data
        );


    } catch (error) {

        console.error(
            "Upload error:",
            error
        );

        alert(
            "Upload failed."
        );
    }
}


// =====================================================
// VOICE RECORDING
// =====================================================

recordBtn.onclick =
    async function () {

        if (!selectedUser) {

            alert(
                "Select a user first."
            );

            return;
        }


        // ---------------------------------------------
        // START RECORDING
        // ---------------------------------------------

        if (!mediaRecorder) {

            try {

                const stream =
                    await navigator
                        .mediaDevices
                        .getUserMedia(
                            {
                                audio: true
                            }
                        );


                let options = {};


                /*
                 Chrome normally supports
                 audio/webm with Opus.
                */

                if (
                    MediaRecorder.isTypeSupported(
                        "audio/webm;codecs=opus"
                    )
                ) {

                    options.mimeType =
                        "audio/webm;codecs=opus";

                }

                else if (
                    MediaRecorder.isTypeSupported(
                        "audio/webm"
                    )
                ) {

                    options.mimeType =
                        "audio/webm";
                }


                mediaRecorder =
                    new MediaRecorder(
                        stream,
                        options
                    );


                audioChunks = [];


                mediaRecorder.ondataavailable =
                    function (event) {

                        if (
                            event.data &&
                            event.data.size > 0
                        ) {

                            audioChunks.push(
                                event.data
                            );
                        }
                    };


                mediaRecorder.onstop =
                    async function () {

                        const mimeType =
                            mediaRecorder.mimeType ||
                            "audio/webm";


                        const audioBlob =
                            new Blob(
                                audioChunks,
                                {
                                    type:
                                        mimeType
                                }
                            );


                        console.log(
                            "Audio size:",
                            audioBlob.size
                        );

                        console.log(
                            "Audio type:",
                            audioBlob.type
                        );


                        if (
                            audioBlob.size === 0
                        ) {

                            alert(
                                "No audio was recorded."
                            );

                            stream
                                .getTracks()
                                .forEach(
                                    track =>
                                        track.stop()
                                );

                            mediaRecorder = null;

                            recording
                                .classList
                                .add(
                                    "hidden"
                                );

                            return;
                        }


                        let extension =
                            "webm";


                        if (
                            mimeType.includes(
                                "ogg"
                            )
                        ) {

                            extension =
                                "ogg";
                        }


                        const audioFile =
                            new File(
                                [
                                    audioBlob
                                ],

                                "voice_" +
                                Date.now() +
                                "." +
                                extension,

                                {
                                    type:
                                        mimeType
                                }
                            );


                        await uploadFile(
                            audioFile,
                            "voice"
                        );


                        stream
                            .getTracks()
                            .forEach(
                                track =>
                                    track.stop()
                            );


                        mediaRecorder = null;

                        audioChunks = [];


                        recording
                            .classList
                            .add(
                                "hidden"
                            );
                    };


                mediaRecorder.start();


                recording
                    .classList
                    .remove(
                        "hidden"
                    );


                console.log(
                    "Recording started"
                );


            }

            catch (error) {

                console.error(
                    "Microphone error:",
                    error
                );


                alert(
                    "Microphone permission is required. " +
                    "Use HTTPS or localhost."
                );
            }

        }


        // ---------------------------------------------
        // STOP RECORDING
        // ---------------------------------------------

        else {

            mediaRecorder.stop();

            console.log(
                "Recording stopped"
            );
        }
    };


// =====================================================
// REAL-TIME MESSAGE
// =====================================================

socket.on(
    "new_message",
    function (message) {

        if (
            selectedUser &&
            (
                message.sender_id ===
                    selectedUser.id ||

                message.receiver_id ===
                    selectedUser.id
            )
        ) {

            renderMessage(
                message
            );

            messagesEl.scrollTop =
                messagesEl.scrollHeight;
        }
    }
);


// =====================================================
// ONLINE / OFFLINE
// =====================================================

socket.on(
    "presence",
    function (presence) {

        if (
            selectedUser &&
            presence.user_id ===
                selectedUser.id
        ) {

            statusEl.textContent =
                presence.online
                    ? "Online"
                    : "Offline";
        }
    }
);


// =====================================================
// START
// =====================================================

loadUsers();