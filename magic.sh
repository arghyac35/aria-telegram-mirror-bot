tar --exclude='./node_modules' --exclude='./.git' -cvf 69.tar .
git add 69.tar
git commit -m "69"
git push heroku heroku:master --force
