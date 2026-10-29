#import <Cocoa/Cocoa.h>
#include <sys/file.h>
#include <fcntl.h>

@interface JoeyLauncher : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@property(strong) NSTextField *status;
@property(strong) NSTask *task;
@property(strong) NSFileHandle *output;
@property(strong) NSMutableString *pending;
@property int lock;
@end
@implementation JoeyLauncher
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    NSString *support = NSProcessInfo.processInfo.environment[@"JOEY_HOME"] ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Joey Online"];
    [[NSFileManager defaultManager] createDirectoryAtPath:support withIntermediateDirectories:YES attributes:nil error:NULL];
    self.lock = open([[support stringByAppendingPathComponent:@"launcher.lock"] fileSystemRepresentation], O_CREAT | O_RDWR | O_CLOEXEC, 0600);
    if (self.lock < 0 || flock(self.lock, LOCK_EX | LOCK_NB) != 0) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Joey Online is already running";
        alert.informativeText = @"Close the existing game before opening another copy.";
        [alert runModal];
        [NSApp terminate:nil];
        return;
    }
    NSMenu *menu = [[NSMenu alloc] init];
    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    [menu addItem:appItem];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"Quit Joey Online" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    NSApp.mainMenu = menu;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,540,150) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Joey Online";
    self.status = [NSTextField wrappingLabelWithString:@"Preparing Joey Online..."];
    self.status.frame = NSMakeRect(25,70,490,55);
    [self.window.contentView addSubview:self.status];
    NSProgressIndicator *progress = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(25,35,490,16)];
    progress.indeterminate = YES;
    progress.style = NSProgressIndicatorStyleBar;
    [progress startAnimation:nil];
    [self.window.contentView addSubview:progress];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    self.pending = [NSMutableString string];
    self.task = [[NSTask alloc] init];
    self.task.executableURL = [NSURL fileURLWithPath:@"/bin/bash"];
    self.task.arguments = @[[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"bootstrap.sh"]];
    NSPipe *pipe = [NSPipe pipe];
    self.task.standardOutput = pipe;
    self.task.standardError = pipe;
    self.output = pipe.fileHandleForReading;
    __weak JoeyLauncher *weakSelf = self;
    self.output.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = handle.availableData;
        if (!data.length) { handle.readabilityHandler = nil; return; }
        NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        if (!text) return;
        dispatch_async(dispatch_get_main_queue(), ^{
            JoeyLauncher *owner = weakSelf;
            [owner.pending appendString:text];
            NSRange newline;
            while ((newline = [owner.pending rangeOfString:@"\n"]).location != NSNotFound) {
                NSString *line = [owner.pending substringToIndex:newline.location];
                [owner.pending deleteCharactersInRange:NSMakeRange(0,newline.location+1)];
                owner.status.stringValue = line;
                if ([line isEqualToString:@"Starting game..."]) [owner.window orderOut:nil];
            }
        });
    };
    self.task.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            JoeyLauncher *owner = weakSelf;
            owner.output.readabilityHandler = nil;
            if (task.terminationStatus != 0) {
                NSAlert *alert = [[NSAlert alloc] init];
                alert.messageText = @"Joey Online could not start";
                alert.informativeText = @"Check your internet connection and try again. Details are saved in Library/Application Support/Joey Online/launcher.log.";
                [alert addButtonWithTitle:@"Close"];
                [alert addButtonWithTitle:@"Show log"];
                if ([alert runModal] == NSAlertSecondButtonReturn) [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:[support stringByAppendingPathComponent:@"launcher.log"]]];
            }
            [NSApp terminate:nil];
        });
    };
    NSError *error = nil;
    if (![self.task launchAndReturnError:&error]) {
        [[NSAlert alertWithError:error] runModal];
        [NSApp terminate:nil];
    }
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    (void)sender;
    if (self.task.running) [self.task terminate];
    return NSTerminateNow;
}
@end
int main(void) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        JoeyLauncher *delegate = [[JoeyLauncher alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
