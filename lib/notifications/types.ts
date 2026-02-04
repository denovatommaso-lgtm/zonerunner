export type NotificationPrefs = {
  pushEnabled?: boolean;
  localEnabled?: boolean;
  territoryStolen?: boolean;
  groupRunStarting?: boolean;
  friendRequest?: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefs> = {
  pushEnabled: false,
  localEnabled: true,
  territoryStolen: true,
  groupRunStarting: true,
  friendRequest: true,
};
