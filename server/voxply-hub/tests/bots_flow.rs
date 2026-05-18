use std::collections::HashMap;
use std::sync::Arc;

use axum_test::TestServer;
use serde_json::json;
use sqlx::sqlite::SqlitePoolOptions;
use tokio::sync::{broadcast, RwLock};
use voxply_hub::auth::models::{ChallengeResponse, VerifyResponse};
use voxply_hub::db;
use voxply_hub::federation::client::FederationClient;
use voxply_hub::server;
use voxply_hub::state::AppState;
use voxply_identity::Identity;

async fn setup() -> TestServer {
    let db = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    db::migrations::run(&db).await.unwrap();
    let state = Arc::new(AppState {
        hub_name: "test-hub".to_string(),
        hub_identity: Identity::generate(),
        db,
        pending_challenges: RwLock::new(HashMap::new()),
        chat_tx: broadcast::channel(256).0,
        federation_client: FederationClient::new(),
        peer_tokens: RwLock::new(HashMap::new()),
        voice_channels: RwLock::new(HashMap::new()),
        voice_udp_port: 0,
        voice_event_tx: broadcast::channel(16).0,
        dm_tx: broadcast::channel(16).0,
        online_users: RwLock::new(std::collections::HashSet::new()),
        screen_shares: RwLock::new(HashMap::new()),
        screen_share_tx: broadcast::channel(16).0,
        http_client: reqwest::Client::new(),
    });
    TestServer::new(server::create_router(state))
}

async fn authenticate(server: &TestServer, identity: &Identity) -> String {
    let pub_key = identity.public_key_hex();
    let challenge: ChallengeResponse = server
        .post("/auth/challenge")
        .json(&json!({ "public_key": pub_key }))
        .await
        .json();
    let signature = identity.sign(&hex::decode(&challenge.challenge).unwrap());
    let verify: VerifyResponse = server
        .post("/auth/verify")
        .json(&json!({
            "public_key": pub_key,
            "challenge": challenge.challenge,
            "signature": hex::encode(signature.to_bytes()),
        }))
        .await
        .json();
    verify.token
}

// ---------------------------------------------------------------------------
// Happy-path tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn owner_can_create_list_and_delete_bot() {
    let server = setup().await;
    let owner = Identity::generate();
    let owner_token = authenticate(&server, &owner).await;

    // Create a bot — returns CREATED with a token
    let resp = server
        .post("/bots")
        .authorization_bearer(&owner_token)
        .json(&json!({ "name": "MyBot" }))
        .await;
    resp.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = resp.json();
    assert_eq!(body["display_name"], "MyBot");
    let bot_key = body["public_key"].as_str().unwrap().to_string();
    assert!(bot_key.starts_with("bot-"));
    let returned_token = body["token"].as_str().unwrap().to_string();
    assert!(!returned_token.is_empty());
    // created_by should be the owner
    assert_eq!(body["created_by"], owner.public_key_hex());

    // List shows the bot
    let list: serde_json::Value = server
        .get("/bots")
        .authorization_bearer(&owner_token)
        .await
        .json();
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["public_key"], bot_key);
    // token is NOT included in list
    assert!(arr[0].get("token").is_none() || arr[0]["token"].is_null());

    // Delete the bot
    server
        .delete(&format!("/bots/{bot_key}"))
        .authorization_bearer(&owner_token)
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);

    // Gone from list
    let list: serde_json::Value = server
        .get("/bots")
        .authorization_bearer(&owner_token)
        .await
        .json();
    assert_eq!(list.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn owner_can_rotate_bot_token() {
    let server = setup().await;
    let owner = Identity::generate();
    let owner_token = authenticate(&server, &owner).await;

    let resp: serde_json::Value = server
        .post("/bots")
        .authorization_bearer(&owner_token)
        .json(&json!({ "name": "RotateMe" }))
        .await
        .json();
    let bot_key = resp["public_key"].as_str().unwrap().to_string();
    let original_token = resp["token"].as_str().unwrap().to_string();

    let rotate_resp: serde_json::Value = server
        .post(&format!("/bots/{bot_key}/rotate-token"))
        .authorization_bearer(&owner_token)
        .await
        .json();
    let new_token = rotate_resp["token"].as_str().unwrap().to_string();
    assert!(!new_token.is_empty());
    assert_ne!(new_token, original_token);
}

#[tokio::test]
async fn bot_token_authenticates_as_bearer() {
    let server = setup().await;
    let owner = Identity::generate();
    let owner_token = authenticate(&server, &owner).await;

    let resp: serde_json::Value = server
        .post("/bots")
        .authorization_bearer(&owner_token)
        .json(&json!({ "name": "AuthBot" }))
        .await
        .json();
    let bot_api_token = resp["token"].as_str().unwrap().to_string();

    // Bot token should be able to call /me (approved bot user)
    let me = server
        .get("/me")
        .authorization_bearer(&bot_api_token)
        .await;
    me.assert_status_success();
}

// ---------------------------------------------------------------------------
// Rejection tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn non_admin_cannot_create_bot() {
    let server = setup().await;
    // First user gets Owner role; second gets @everyone only.
    let _owner_token = authenticate(&server, &Identity::generate()).await;
    let rando_token = authenticate(&server, &Identity::generate()).await;

    let resp = server
        .post("/bots")
        .authorization_bearer(&rando_token)
        .json(&json!({ "name": "Sneaky" }))
        .await;
    resp.assert_status(axum::http::StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn create_bot_rejects_empty_name() {
    let server = setup().await;
    let owner_token = authenticate(&server, &Identity::generate()).await;

    let resp = server
        .post("/bots")
        .authorization_bearer(&owner_token)
        .json(&json!({ "name": "   " }))
        .await;
    resp.assert_status(axum::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_bot_returns_404_for_unknown_key() {
    let server = setup().await;
    let owner_token = authenticate(&server, &Identity::generate()).await;

    let resp = server
        .delete("/bots/bot-does-not-exist")
        .authorization_bearer(&owner_token)
        .await;
    resp.assert_status(axum::http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_bot_rejects_real_user() {
    let server = setup().await;
    let owner = Identity::generate();
    let owner_token = authenticate(&server, &owner).await;

    // Try to delete the owner's own account via the bot endpoint
    let pk = owner.public_key_hex();
    let resp = server
        .delete(&format!("/bots/{pk}"))
        .authorization_bearer(&owner_token)
        .await;
    resp.assert_status(axum::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn rotate_token_returns_404_for_unknown_key() {
    let server = setup().await;
    let owner_token = authenticate(&server, &Identity::generate()).await;

    let resp = server
        .post("/bots/bot-does-not-exist/rotate-token")
        .authorization_bearer(&owner_token)
        .await;
    resp.assert_status(axum::http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn invalid_bot_token_returns_unauthorized() {
    let server = setup().await;

    let resp = server
        .get("/me")
        .authorization_bearer("totallyfaketoken1234")
        .await;
    resp.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
