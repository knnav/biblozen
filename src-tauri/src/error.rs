use serde::{Serialize, Serializer};

/// Typed error returned from every command. Serialized as `{ kind, message }`
/// so the frontend can show a meaningful toast.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Path is outside any open folder: {0}")]
    OutOfScope(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Could not move to trash: {0}")]
    Trash(String),
    #[error("{0}")]
    Other(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::NotFound(_) => "notFound",
            AppError::OutOfScope(_) => "outOfScope",
            AppError::AlreadyExists(_) => "alreadyExists",
            AppError::InvalidPath(_) => "invalidPath",
            AppError::Trash(_) => "trash",
            AppError::Other(_) => "other",
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => AppError::NotFound(e.to_string()),
            std::io::ErrorKind::AlreadyExists => AppError::AlreadyExists(e.to_string()),
            _ => AppError::Io(e.to_string()),
        }
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
