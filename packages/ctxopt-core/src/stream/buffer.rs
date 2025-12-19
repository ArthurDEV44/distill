//! Ring buffer pour stocker l'historique du flux
//!
//! Buffer circulaire pour garder les N derniers caractères
//! du stream pour analyse contextuelle.

use std::collections::VecDeque;

/// Buffer circulaire pour stocker les derniers N caractères
#[derive(Debug)]
pub struct RingBuffer {
    /// Données stockées
    data: VecDeque<char>,

    /// Capacité maximale
    capacity: usize,
}

impl RingBuffer {
    /// Crée un nouveau buffer avec la capacité spécifiée
    pub fn new(capacity: usize) -> Self {
        Self {
            data: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    /// Ajoute des caractères au buffer
    pub fn push(&mut self, text: &str) {
        for ch in text.chars() {
            if self.data.len() >= self.capacity {
                self.data.pop_front();
            }
            self.data.push_back(ch);
        }
    }

    /// Retourne le contenu actuel du buffer comme String (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn content(&self) -> String {
        self.data.iter().collect()
    }

    /// Vide le buffer
    pub fn clear(&mut self) {
        self.data.clear();
    }

    /// Retourne la taille actuelle (nombre de caractères)
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Vérifie si le buffer est vide (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Retourne les N derniers caractères
    pub fn last_n(&self, n: usize) -> String {
        let start = self.data.len().saturating_sub(n);
        self.data.iter().skip(start).collect()
    }

    /// Retourne la capacité maximale (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_push() {
        let mut buf = RingBuffer::new(10);
        buf.push("hello");
        assert_eq!(buf.content(), "hello");
        assert_eq!(buf.len(), 5);
    }

    #[test]
    fn test_ring_buffer_overflow() {
        let mut buf = RingBuffer::new(5);
        buf.push("hello world");
        assert_eq!(buf.content(), "world");
        assert_eq!(buf.len(), 5);
    }

    #[test]
    fn test_ring_buffer_last_n() {
        let mut buf = RingBuffer::new(100);
        buf.push("hello world");
        assert_eq!(buf.last_n(5), "world");
        assert_eq!(buf.last_n(100), "hello world");
    }

    #[test]
    fn test_ring_buffer_clear() {
        let mut buf = RingBuffer::new(100);
        buf.push("hello");
        assert!(!buf.is_empty());
        buf.clear();
        assert!(buf.is_empty());
        assert_eq!(buf.len(), 0);
    }

    #[test]
    fn test_ring_buffer_unicode() {
        let mut buf = RingBuffer::new(10);
        buf.push("héllo");
        assert_eq!(buf.len(), 5);
        assert_eq!(buf.content(), "héllo");
    }

    #[test]
    fn test_ring_buffer_emoji() {
        let mut buf = RingBuffer::new(5);
        buf.push("a❯b");
        assert_eq!(buf.len(), 3);
        assert_eq!(buf.content(), "a❯b");
    }

    #[test]
    fn test_ring_buffer_incremental_push() {
        let mut buf = RingBuffer::new(10);
        buf.push("hello");
        buf.push(" ");
        buf.push("world");
        // "hello " (6) + "world" (5) = 11 chars, capacity 10
        // After overflow: removes first char -> "ello world"
        assert_eq!(buf.content(), "ello world");
        assert_eq!(buf.len(), 10);
    }
}
