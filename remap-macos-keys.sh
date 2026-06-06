#!/usr/bin/env bash
set -euo pipefail

MAC_KEY_OPTIONS="['ctrl:swap_lalt_lctl_lwin']"
APP_DRAWER_KEYS="['<Control>space']"
SWITCH_APPS_KEYS="['<Control>Tab']"
SWITCH_APPS_BACKWARD_KEYS="['<Shift><Control>Tab']"
SWITCH_SAME_APP_KEYS="['<Control>Above_Tab']"
SWITCH_SAME_APP_BACKWARD_KEYS="['<Shift><Control>Above_Tab']"
SCREENSHOT_UI_KEYS="['<Shift><Control>4', '<Shift><Super>4']"
RECTANGLE_TILE_LEFT_KEYS="['<Control><Alt>Left', '<Control><Super>Left']"
RECTANGLE_TILE_RIGHT_KEYS="['<Control><Alt>Right', '<Control><Super>Right']"
RECTANGLE_MAXIMIZE_KEYS="['<Control><Alt>Up', '<Control><Super>Up']"
RECTANGLE_RESTORE_KEYS="['<Control><Alt>Down', '<Control><Super>Down']"
RECTANGLE_TOGGLE_MAXIMIZE_KEYS="['<Control><Alt>Return', '<Control><Super>Return', '<Alt>F10']"
WORKSPACE_LEFT_KEYS_WITHOUT_RECTANGLE_CONFLICT="['<Super>Page_Up', '<Super>KP_Prior', '<Super><Alt>Left']"
WORKSPACE_RIGHT_KEYS_WITHOUT_RECTANGLE_CONFLICT="['<Super>Page_Down', '<Super>KP_Next', '<Super><Alt>Right']"
BACKUP_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/remap-macos-keys.backup"

usage() {
  cat <<'EOF'
Usage:
  ./remap-macos-keys.sh            # Interactive menu
  ./remap-macos-keys.sh apply      # Apply Mac-style keys and Rectangle-style tiling
  ./remap-macos-keys.sh undo-all   # Restore/reset everything this script changes
  ./remap-macos-keys.sh status     # Show current keyboard options

Notes:
  - This is for GNOME/Ubuntu sessions.
  - The apply mode sets: ctrl:swap_lalt_lctl_lwin
  - That makes Left Alt behave like Ctrl, so Alt+C/V/S/Z works like macOS Command+C/V/S/Z.
  - It also binds Cmd+Space to the GNOME app drawer.
  - It binds Cmd+Tab to switch apps, and Cmd+` to switch windows in the same app.
  - It binds Cmd+Shift+4 to the GNOME screenshot UI.
  - It binds Rectangle-style tiling:
    Control+Option+Left/Right for halves, Up for maximize, Down for restore.
EOF
}

require_gsettings() {
  if ! command -v gsettings >/dev/null 2>&1; then
    echo "Error: gsettings was not found. This script is intended for GNOME/Ubuntu." >&2
    exit 1
  fi
}

save_backup() {
  mkdir -p "$(dirname "$BACKUP_FILE")"
  if [[ ! -f "$BACKUP_FILE" ]]; then
    printf 'XKB_OPTIONS=%q\n' "$(gsettings get org.gnome.desktop.input-sources xkb-options)" >"$BACKUP_FILE"
    printf 'APP_DRAWER_BINDING=%q\n' "$(gsettings get org.gnome.shell.keybindings toggle-application-view)" >>"$BACKUP_FILE"
  fi

  local backup_contents
  backup_contents="$(<"$BACKUP_FILE")"

  if [[ "$backup_contents" != *"SWITCH_APPLICATIONS_BINDING="* ]]; then
    printf 'SWITCH_APPLICATIONS_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-applications)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"SWITCH_APPLICATIONS_BACKWARD_BINDING="* ]]; then
    printf 'SWITCH_APPLICATIONS_BACKWARD_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-applications-backward)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"SWITCH_SAME_APP_BINDING="* ]]; then
    printf 'SWITCH_SAME_APP_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-group)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"SWITCH_SAME_APP_BACKWARD_BINDING="* ]]; then
    printf 'SWITCH_SAME_APP_BACKWARD_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-group-backward)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"SCREENSHOT_UI_BINDING="* ]]; then
    printf 'SCREENSHOT_UI_BINDING=%q\n' "$(gsettings get org.gnome.shell.keybindings show-screenshot-ui)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"TILE_LEFT_BINDING="* ]]; then
    printf 'TILE_LEFT_BINDING=%q\n' "$(gsettings get org.gnome.mutter.keybindings toggle-tiled-left)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"TILE_RIGHT_BINDING="* ]]; then
    printf 'TILE_RIGHT_BINDING=%q\n' "$(gsettings get org.gnome.mutter.keybindings toggle-tiled-right)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"MAXIMIZE_BINDING="* ]]; then
    printf 'MAXIMIZE_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings maximize)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"UNMAXIMIZE_BINDING="* ]]; then
    printf 'UNMAXIMIZE_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings unmaximize)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"TOGGLE_MAXIMIZED_BINDING="* ]]; then
    printf 'TOGGLE_MAXIMIZED_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings toggle-maximized)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"WORKSPACE_UP_BINDING="* ]]; then
    printf 'WORKSPACE_UP_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-up)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"WORKSPACE_DOWN_BINDING="* ]]; then
    printf 'WORKSPACE_DOWN_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-down)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"WORKSPACE_LEFT_BINDING="* ]]; then
    printf 'WORKSPACE_LEFT_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-left)" >>"$BACKUP_FILE"
  fi
  if [[ "$backup_contents" != *"WORKSPACE_RIGHT_BINDING="* ]]; then
    printf 'WORKSPACE_RIGHT_BINDING=%q\n' "$(gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-right)" >>"$BACKUP_FILE"
  fi
}

apply_mapping() {
  require_gsettings
  save_backup
  gsettings set org.gnome.desktop.input-sources xkb-options "$MAC_KEY_OPTIONS"
  gsettings set org.gnome.shell.keybindings toggle-application-view "$APP_DRAWER_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings switch-applications "$SWITCH_APPS_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings switch-applications-backward "$SWITCH_APPS_BACKWARD_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings switch-group "$SWITCH_SAME_APP_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings switch-group-backward "$SWITCH_SAME_APP_BACKWARD_KEYS"
  gsettings set org.gnome.shell.keybindings show-screenshot-ui "$SCREENSHOT_UI_KEYS"
  gsettings set org.gnome.mutter.keybindings toggle-tiled-left "$RECTANGLE_TILE_LEFT_KEYS"
  gsettings set org.gnome.mutter.keybindings toggle-tiled-right "$RECTANGLE_TILE_RIGHT_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings maximize "$RECTANGLE_MAXIMIZE_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings unmaximize "$RECTANGLE_RESTORE_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings toggle-maximized "$RECTANGLE_TOGGLE_MAXIMIZE_KEYS"
  gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-up "[]"
  gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-down "[]"
  gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-left "$WORKSPACE_LEFT_KEYS_WITHOUT_RECTANGLE_CONFLICT"
  gsettings set org.gnome.desktop.wm.keybindings switch-to-workspace-right "$WORKSPACE_RIGHT_KEYS_WITHOUT_RECTANGLE_CONFLICT"
  echo "Applied Mac-style keyboard mapping and Rectangle-style shortcuts."
  show_status
}

restore_or_reset() {
  local var_name="$1"
  local schema="$2"
  local key="$3"

  if [[ -n "${!var_name:-}" ]]; then
    gsettings set "$schema" "$key" "${!var_name}"
  else
    gsettings reset "$schema" "$key"
  fi
}

undo_all() {
  require_gsettings
  if [[ -f "$BACKUP_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$BACKUP_FILE"
    restore_or_reset XKB_OPTIONS org.gnome.desktop.input-sources xkb-options
    restore_or_reset APP_DRAWER_BINDING org.gnome.shell.keybindings toggle-application-view
    restore_or_reset SWITCH_APPLICATIONS_BINDING org.gnome.desktop.wm.keybindings switch-applications
    restore_or_reset SWITCH_APPLICATIONS_BACKWARD_BINDING org.gnome.desktop.wm.keybindings switch-applications-backward
    restore_or_reset SWITCH_SAME_APP_BINDING org.gnome.desktop.wm.keybindings switch-group
    restore_or_reset SWITCH_SAME_APP_BACKWARD_BINDING org.gnome.desktop.wm.keybindings switch-group-backward
    restore_or_reset SCREENSHOT_UI_BINDING org.gnome.shell.keybindings show-screenshot-ui
    restore_or_reset TILE_LEFT_BINDING org.gnome.mutter.keybindings toggle-tiled-left
    restore_or_reset TILE_RIGHT_BINDING org.gnome.mutter.keybindings toggle-tiled-right
    restore_or_reset MAXIMIZE_BINDING org.gnome.desktop.wm.keybindings maximize
    restore_or_reset UNMAXIMIZE_BINDING org.gnome.desktop.wm.keybindings unmaximize
    restore_or_reset TOGGLE_MAXIMIZED_BINDING org.gnome.desktop.wm.keybindings toggle-maximized
    restore_or_reset WORKSPACE_UP_BINDING org.gnome.desktop.wm.keybindings switch-to-workspace-up
    restore_or_reset WORKSPACE_DOWN_BINDING org.gnome.desktop.wm.keybindings switch-to-workspace-down
    restore_or_reset WORKSPACE_LEFT_BINDING org.gnome.desktop.wm.keybindings switch-to-workspace-left
    restore_or_reset WORKSPACE_RIGHT_BINDING org.gnome.desktop.wm.keybindings switch-to-workspace-right
    rm -f "$BACKUP_FILE"
    echo "Restored previous keyboard mapping, shortcuts, and tiling bindings."
  else
    gsettings set org.gnome.desktop.input-sources xkb-options "[]"
    gsettings reset org.gnome.shell.keybindings toggle-application-view
    gsettings reset org.gnome.desktop.wm.keybindings switch-applications
    gsettings reset org.gnome.desktop.wm.keybindings switch-applications-backward
    gsettings reset org.gnome.desktop.wm.keybindings switch-group
    gsettings reset org.gnome.desktop.wm.keybindings switch-group-backward
    gsettings reset org.gnome.shell.keybindings show-screenshot-ui
    gsettings reset org.gnome.mutter.keybindings toggle-tiled-left
    gsettings reset org.gnome.mutter.keybindings toggle-tiled-right
    gsettings reset org.gnome.desktop.wm.keybindings maximize
    gsettings reset org.gnome.desktop.wm.keybindings unmaximize
    gsettings reset org.gnome.desktop.wm.keybindings toggle-maximized
    gsettings reset org.gnome.desktop.wm.keybindings switch-to-workspace-up
    gsettings reset org.gnome.desktop.wm.keybindings switch-to-workspace-down
    gsettings reset org.gnome.desktop.wm.keybindings switch-to-workspace-left
    gsettings reset org.gnome.desktop.wm.keybindings switch-to-workspace-right
    echo "Reset keyboard mapping, shortcuts, and tiling bindings."
  fi
  show_status
}

show_status() {
  require_gsettings
  echo -n "Current xkb-options: "
  gsettings get org.gnome.desktop.input-sources xkb-options
  echo -n "Current app drawer shortcut: "
  gsettings get org.gnome.shell.keybindings toggle-application-view
  echo -n "Current app switch shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings switch-applications
  echo -n "Current same-app switch shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings switch-group
  echo -n "Current screenshot UI shortcut: "
  gsettings get org.gnome.shell.keybindings show-screenshot-ui
  echo -n "Current tile-left shortcut: "
  gsettings get org.gnome.mutter.keybindings toggle-tiled-left
  echo -n "Current tile-right shortcut: "
  gsettings get org.gnome.mutter.keybindings toggle-tiled-right
  echo -n "Current maximize shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings maximize
  echo -n "Current restore shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings unmaximize
  echo -n "Current workspace-left shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-left
  echo -n "Current workspace-right shortcut: "
  gsettings get org.gnome.desktop.wm.keybindings switch-to-workspace-right
}

interactive_menu() {
  require_gsettings
  while true; do
    cat <<'EOF'

Mac-style keyboard setup
1) Apply Mac-style keys and Rectangle-style tiling
2) Undo all changes made by this script
3) Show status
4) Help
5) Exit
EOF
    read -r -p "Choose an option [1-5]: " choice
    case "$choice" in
      1)
        apply_mapping
        ;;
      2)
        undo_all
        ;;
      3)
        show_status
        ;;
      4)
        usage
        ;;
      5|q|quit|exit)
        exit 0
        ;;
      *)
        echo "Invalid option: $choice"
        ;;
    esac
  done
}

if [[ $# -eq 0 ]]; then
  interactive_menu
  exit 0
fi

case "$1" in
  apply)
    apply_mapping
    ;;
  undo|reset|undo-all|reset-all)
    undo_all
    ;;
  status)
    show_status
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
