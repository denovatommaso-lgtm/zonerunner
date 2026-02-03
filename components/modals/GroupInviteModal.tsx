import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (username: string) => Promise<void>;
};

export function GroupInviteModal({ visible, onClose, onSend }: Props) {
  const [username, setUsername] = React.useState('');

  const handleSend = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;
    await onSend(trimmed);
    setUsername('');
  };

  const handleClose = () => {
    setUsername('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Invite to group</Text>
              <Text style={styles.subtitle}>
                Send an invite by username. It will appear as a group invite in their profile.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="@username"
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor="#38bdf8"
                value={username}
                onChangeText={setUsername}
              />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleSend}
                >
                  <Text style={styles.actionText}>Send invite</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#9ca3af44',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  title: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 14,
    color: 'white',
    fontSize: 16,
    minHeight: 48,
  },
  actions: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 12,
    paddingBottom: 24,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  actionText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
});
