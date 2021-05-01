tar --exclude='./node_modules' --exclude='./.git' --exclude='./downloads' -cvf bot.tar .
git add bot.tar
git commit -m "Add bot.tar"
git push heroku HEAD:master --force