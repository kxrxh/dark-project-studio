// Legacy host-reaction settings are retained only to read and migrate saved profiles.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Flash,
    Ripple,
    Cross,
    Burst,
    Row,
    Column,
    Diagonal,
    Doubleripple,
    Shockwave,
    Sweep,
    Diamond,
    Comet,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub kind: Kind,
    pub colors: Vec<[u8; 3]>,
    pub lifetime_ms: u16,
    pub speed: u8,
    pub background: u8,
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if self.colors.is_empty()
            || self.colors.len() > 5
            || !(150..=4000).contains(&self.lifetime_ms)
            || !(1..=5).contains(&self.speed)
            || self.background > 30
        {
            return Err("Некорректные параметры реакции на нажатия".into());
        }
        Ok(())
    }
}
