using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

// Small portable launcher. It preserves the original Kawaikara icon without
// modifying the signed Electron executable used for protected media.
internal static class Launcher {
    [STAThread]
    private static void Main() {
        try {
            string folder = AppDomain.CurrentDomain.BaseDirectory;
            string executable = Path.Combine(folder, "electron.exe");
            if (!File.Exists(executable)) {
                MessageBox.Show("압축을 모두 푼 뒤 실행해 주세요. 프로그램 파일을 찾을 수 없습니다.", "Kawaikara AI fork");
                return;
            }
            ProcessStartInfo start = new ProcessStartInfo(executable);
            start.WorkingDirectory = folder;
            start.UseShellExecute = false;
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            start.EnvironmentVariables.Remove("IS_DEV");
            start.EnvironmentVariables.Remove("KAWAIKARA_DATA_DIR");
            Process.Start(start);
        } catch {
            MessageBox.Show("프로그램을 시작할 수 없습니다. 압축을 모두 풀었는지 확인해 주세요.", "Kawaikara AI fork");
        }
    }
}
